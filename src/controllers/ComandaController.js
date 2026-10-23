const crypto = require('crypto');
const connection = require('../database/connection');

function erro(response, status, message) {
    return response.status(status).json({
        status: false,
        message,
    });
}

function gerarCodigoComanda() {
    return `C${Date.now().toString().slice(-9)}${crypto
        .randomBytes(2)
        .toString('hex')
        .toUpperCase()}`;
}

function dinheiroParaCentavos(valor) {
    const numero = Number(valor);

    if (!Number.isFinite(numero) || numero < 0) {
        return null;
    }

    return Math.round(numero * 100);
}

function valorEmReais(centavos) {
    return (centavos / 100).toFixed(2);
}

async function recalcularComanda(trx, comandaId, estabelecimentoId) {
    const comanda = await trx('mv_comandas')
        .where({
            id: comandaId,
            estabelecimento_id: estabelecimentoId,
        })
        .forUpdate()
        .first();

    if (!comanda) {
        throw new Error('COMANDA_NAO_ENCONTRADA');
    }

    const resultadoItens = await trx('mv_itens_comanda')
        .where({
            comanda_id: comandaId,
            status: 'ATIVO',
        })
        .sum({ subtotal: 'subtotal' })
        .first();

    const subtotalCentavos =
        dinheiroParaCentavos(resultadoItens?.subtotal || 0) || 0;

    const taxaCentavos =
        dinheiroParaCentavos(comanda.taxa_servico || 0) || 0;

    const descontoCentavos =
        dinheiroParaCentavos(comanda.desconto || 0) || 0;

    const totalCentavos = Math.max(
        0,
        subtotalCentavos + taxaCentavos - descontoCentavos
    );

    await trx('mv_comandas')
        .where({
            id: comandaId,
            estabelecimento_id: estabelecimentoId,
        })
        .update({
            subtotal: valorEmReais(subtotalCentavos),
            total: valorEmReais(totalCentavos),
            updated_at: trx.fn.now(),
        });

    return {
        ...comanda,
        subtotal: valorEmReais(subtotalCentavos),
        total: valorEmReais(totalCentavos),
        totalCentavos,
    };
}

async function obterTotalPago(trx, comandaId) {
    const resultado = await trx('mv_pagamentos')
        .where({
            comanda_id: comandaId,
            status: 'CONFIRMADO',
        })
        .sum({ total_pago: 'valor' })
        .first();

    return dinheiroParaCentavos(resultado?.total_pago || 0) || 0;
}

module.exports = {
    // =====================================================
    // LISTAR COMANDAS
    // GET /comandas
    // =====================================================
    async listar(request, response) {
        try {
            const estabelecimentoId = request.estabelecimentoId;
            const { status, tipo } = request.query;

            let consulta = connection('mv_comandas as c')
                .leftJoin('mv_mesas as m', 'm.id', 'c.mesa_id')
                .where('c.estabelecimento_id', estabelecimentoId)
                .select(
                    'c.id',
                    'c.codigo',
                    'c.tipo',
                    'c.cliente_nome',
                    'c.mesa_id',
                    'm.numero as mesa_numero',
                    'c.status',
                    'c.subtotal',
                    'c.taxa_servico',
                    'c.desconto',
                    'c.total',
                    'c.aberta_em',
                    'c.fechada_em',
                    'c.created_at'
                )
                .orderBy('c.aberta_em', 'desc');

            if (status) {
                const statusPermitidos = ['ABERTA', 'FECHADA'];

                if (!statusPermitidos.includes(status)) {
                    return erro(response, 400, 'Status inválido.');
                }

                consulta = consulta.where('c.status', status);
            }

            if (tipo) {
                const tiposPermitidos = ['MESA', 'BALCAO'];

                if (!tiposPermitidos.includes(tipo)) {
                    return erro(response, 400, 'Tipo de comanda inválido.');
                }

                consulta = consulta.where('c.tipo', tipo);
            }

            const comandas = await consulta;

            return response.json({
                status: true,
                dados: comandas,
            });
        } catch (error) {
            console.error('Erro ao listar comandas:', error);

            return erro(response, 500, 'Não foi possível listar as comandas.');
        }
    },

    // =====================================================
    // CONSULTAR COMANDA E ITENS
    // GET /comandas/:id
    // =====================================================
    async consultar(request, response) {
        try {
            const estabelecimentoId = request.estabelecimentoId;
            const { id } = request.params;

            const comanda = await connection('mv_comandas as c')
                .leftJoin('mv_mesas as m', 'm.id', 'c.mesa_id')
                .where({
                    'c.id': id,
                    'c.estabelecimento_id': estabelecimentoId,
                })
                .select(
                    'c.*',
                    'm.numero as mesa_numero'
                )
                .first();

            if (!comanda) {
                return erro(response, 404, 'Comanda não encontrada.');
            }

            const itens = await connection('mv_itens_comanda')
                .where({ comanda_id: id })
                .orderBy('created_at', 'asc');

            const pagamentos = await connection('mv_pagamentos')
                .where({ comanda_id: id })
                .orderBy('created_at', 'asc')
                .select(
                    'id',
                    'valor',
                    'forma_pagamento',
                    'status',
                    'observacao',
                    'registrado_por',
                    'created_at'
                );

            const totalPago = pagamentos
                .filter((pagamento) => pagamento.status === 'CONFIRMADO')
                .reduce(
                    (total, pagamento) =>
                        total + (dinheiroParaCentavos(pagamento.valor) || 0),
                    0
                );

            const totalCentavos =
                dinheiroParaCentavos(comanda.total) || 0;

            return response.json({
                status: true,
                dados: {
                    ...comanda,
                    itens,
                    pagamentos,
                    total_pago: valorEmReais(totalPago),
                    saldo_devedor: valorEmReais(
                        Math.max(0, totalCentavos - totalPago)
                    ),
                },
            });
        } catch (error) {
            console.error('Erro ao consultar comanda:', error);

            return erro(response, 500, 'Não foi possível consultar a comanda.');
        }
    },

    // =====================================================
    // ABRIR COMANDA
    // POST /comandas
    // =====================================================
    async abrir(request, response) {
        const estabelecimentoId = request.estabelecimentoId;

        const {
            tipo,
            mesa_id,
            cliente_nome,
            observacao,
        } = request.body || {};

        if (!['MESA', 'BALCAO'].includes(tipo)) {
            return erro(
                response,
                400,
                'Informe o tipo MESA ou BALCAO.'
            );
        }

        if (tipo === 'MESA' && !mesa_id) {
            return erro(
                response,
                400,
                'Selecione uma mesa para abrir esta comanda.'
            );
        }

        if (tipo === 'BALCAO' && mesa_id) {
            return erro(
                response,
                400,
                'Uma comanda de balcão não deve ter mesa vinculada.'
            );
        }

        if (
            cliente_nome != null &&
            (typeof cliente_nome !== 'string' || cliente_nome.length > 150)
        ) {
            return erro(response, 400, 'Nome do cliente inválido.');
        }

        if (
            observacao != null &&
            (typeof observacao !== 'string' || observacao.length > 1000)
        ) {
            return erro(response, 400, 'Observação inválida.');
        }

        try {
            const comandaCriada = await connection.transaction(async (trx) => {
                if (tipo === 'MESA') {
                    const mesa = await trx('mv_mesas')
                        .where({
                            id: mesa_id,
                            estabelecimento_id: estabelecimentoId,
                            status: 'ATIVA',
                        })
                        .first();

                    if (!mesa) {
                        throw new Error('MESA_INVALIDA');
                    }
                }

                const comandaId = crypto.randomUUID();

                const comanda = {
                    id: comandaId,
                    estabelecimento_id: estabelecimentoId,
                    mesa_id: tipo === 'MESA' ? mesa_id : null,
                    codigo: gerarCodigoComanda(),
                    tipo,
                    cliente_nome: cliente_nome
                        ? cliente_nome.trim()
                        : null,
                    status: 'ABERTA',
                    subtotal: '0.00',
                    taxa_servico: '0.00',
                    desconto: '0.00',
                    total: '0.00',
                    observacao: observacao
                        ? observacao.trim()
                        : null,
                    aberta_em: trx.fn.now(),
                    created_at: trx.fn.now(),
                    updated_at: trx.fn.now(),
                };

                await trx('mv_comandas').insert(comanda);

                // Busca o registro já gravado no banco.
                // Assim, as datas retornadas são os valores reais do MySQL.
                const registro = await trx('mv_comandas')
                    .where({
                        id: comandaId,
                        estabelecimento_id: estabelecimentoId,
                    })
                    .first();

                return registro;
            });

            return response.status(201).json({
                status: true,
                message: 'Comanda aberta com sucesso.',
                dados: comandaCriada,
            });
        } catch (error) {
            if (error.message === 'MESA_INVALIDA') {
                return erro(
                    response,
                    400,
                    'A mesa não existe, está inativa ou não pertence ao estabelecimento.'
                );
            }

            console.error('Erro ao abrir comanda:', error);

            return erro(response, 500, 'Não foi possível abrir a comanda.');
        }
    },

    // =====================================================
    // ADICIONAR PRODUTO
    // POST /comandas/:id/itens
    // =====================================================
    async adicionarItem(request, response) {
        const estabelecimentoId = request.estabelecimentoId;
        const comandaId = request.params.id;

        const {
            produto_id,
            quantidade,
            observacao,
        } = request.body || {};

        if (typeof produto_id !== 'string' || !produto_id.trim()) {
            return erro(response, 400, 'Informe um produto válido.');
        }

        const qtd = Number(quantidade);

        if (!Number.isInteger(qtd) || qtd < 1 || qtd > 999) {
            return erro(
                response,
                400,
                'A quantidade deve ser um número inteiro entre 1 e 999.'
            );
        }

        if (
            observacao != null &&
            (typeof observacao !== 'string' || observacao.length > 500)
        ) {
            return erro(response, 400, 'Observação do item inválida.');
        }

        try {
            const resultado = await connection.transaction(async (trx) => {
                const comanda = await trx('mv_comandas')
                    .where({
                        id: comandaId,
                        estabelecimento_id: estabelecimentoId,
                    })
                    .forUpdate()
                    .first();

                if (!comanda) {
                    throw new Error('COMANDA_NAO_ENCONTRADA');
                }

                if (comanda.status !== 'ABERTA') {
                    throw new Error('COMANDA_FECHADA');
                }

                const produto = await trx('mv_produtos')
                    .where({
                        id: produto_id.trim(),
                        estabelecimento_id: estabelecimentoId,
                        ativo: 1,
                    })
                    .first();

                if (!produto) {
                    throw new Error('PRODUTO_INDISPONIVEL');
                }

                const precoCentavos = dinheiroParaCentavos(produto.preco);

                if (precoCentavos === null) {
                    throw new Error('PRECO_INVALIDO');
                }

                const subtotalCentavos = precoCentavos * qtd;

                if (!Number.isSafeInteger(subtotalCentavos)) {
                    throw new Error('SUBTOTAL_INVALIDO');
                }

                const item = {
                    id: crypto.randomUUID(),
                    comanda_id: comandaId,
                    produto_id: produto.id,
                    produto_nome: produto.nome,
                    preco_unitario: valorEmReais(precoCentavos),
                    quantidade: qtd,
                    subtotal: valorEmReais(subtotalCentavos),
                    observacao: observacao ? observacao.trim() : null,
                    status: 'ATIVO',
                    created_at: trx.fn.now(),
                    updated_at: trx.fn.now(),
                };
                                
                await trx('mv_itens_comanda').insert(item);

                // Recupera o item já gravado no MySQL.
                // Isso evita retornar as expressões internas do Knex.
                const itemRegistrado = await trx('mv_itens_comanda')
                    .where({
                        id: item.id,
                        comanda_id: comandaId,
                    })
                    .first();

                const atualizada = await recalcularComanda(
                    trx,
                    comandaId,
                    estabelecimentoId
                );

                return {
                    item: itemRegistrado,
                    total: atualizada.total,
                };
            });

            return response.status(201).json({
                status: true,
                message: 'Produto adicionado à comanda.',
                dados: resultado,
            });
        } catch (error) {
            const erros = {
                COMANDA_NAO_ENCONTRADA: [
                    404,
                    'Comanda não encontrada.',
                ],
                COMANDA_FECHADA: [
                    400,
                    'Não é possível adicionar itens a uma comanda fechada.',
                ],
                PRODUTO_INDISPONIVEL: [
                    400,
                    'Produto não encontrado, inativo ou pertencente a outro estabelecimento.',
                ],
                PRECO_INVALIDO: [
                    400,
                    'O preço cadastrado para o produto é inválido.',
                ],
                SUBTOTAL_INVALIDO: [
                    400,
                    'Não foi possível calcular o subtotal.',
                ],
            };

            if (erros[error.message]) {
                return erro(response, ...erros[error.message]);
            }

            console.error('Erro ao adicionar item à comanda:', error);

            return erro(response, 500, 'Não foi possível adicionar o produto.');
        }
    },

    // =====================================================
    // CANCELAR ITEM
    // DELETE /comandas/:id/itens/:itemId
    // O item é preservado no histórico.
    // =====================================================
    async removerItem(request, response) {
        const estabelecimentoId = request.estabelecimentoId;
        const comandaId = request.params.id;
        const itemId = request.params.itemId;

        if (
            typeof comandaId !== 'string' ||
            !comandaId.trim() ||
            typeof itemId !== 'string' ||
            !itemId.trim()
        ) {
            return erro(
                response,
                400,
                'Informe uma comanda e um item válidos.'
            );
        }

        try {
            const resultado = await connection.transaction(async (trx) => {
                // 1. Bloqueia a comanda e valida o estabelecimento.
                const comanda = await trx('mv_comandas')
                    .where({
                        id: comandaId,
                        estabelecimento_id: estabelecimentoId,
                    })
                    .forUpdate()
                    .first();

                if (!comanda) {
                    throw new Error('COMANDA_NAO_ENCONTRADA');
                }

                // 2. Impede alterações em comandas fechadas.
                if (comanda.status !== 'ABERTA') {
                    throw new Error('COMANDA_FECHADA');
                }

                // 3. Busca e bloqueia o item ativo da comanda.
                const item = await trx('mv_itens_comanda')
                    .where({
                        id: itemId,
                        comanda_id: comandaId,
                        status: 'ATIVO',
                    })
                    .forUpdate()
                    .first();

                if (!item) {
                    throw new Error('ITEM_NAO_ENCONTRADO');
                }

                // 4. Cancela somente se o item ainda estiver ativo.
                const itensAtualizados = await trx('mv_itens_comanda')
                    .where({
                        id: itemId,
                        comanda_id: comandaId,
                        status: 'ATIVO',
                    })
                    .update({
                        status: 'CANCELADO',
                        updated_at: trx.fn.now(),
                    });

                // 5. Confirma que o registro foi alterado.
                if (!itensAtualizados) {
                    throw new Error('ITEM_NAO_ENCONTRADO');
                }

                // 6. Recalcula subtotal e total da comanda.
                const comandaAtualizada = await recalcularComanda(
                    trx,
                    comandaId,
                    estabelecimentoId
                );

                // 7. Recupera o item cancelado já gravado no banco.
                const itemCancelado = await trx('mv_itens_comanda')
                    .where({
                        id: itemId,
                        comanda_id: comandaId,
                    })
                    .first();

                return {
                    item: itemCancelado,
                    subtotal: comandaAtualizada.subtotal,
                    total: comandaAtualizada.total,
                };
            });

            return response.json({
                status: true,
                message: 'Item cancelado e total atualizado.',
                dados: resultado,
            });
        } catch (error) {
            const erros = {
                COMANDA_NAO_ENCONTRADA: [
                    404,
                    'Comanda não encontrada.',
                ],
                COMANDA_FECHADA: [
                    400,
                    'Não é possível alterar uma comanda fechada.',
                ],
                ITEM_NAO_ENCONTRADO: [
                    404,
                    'Item ativo não encontrado nesta comanda.',
                ],
            };

            if (erros[error.message]) {
                return erro(response, ...erros[error.message]);
            }

            console.error('Erro ao cancelar item:', error);

            return erro(
                response,
                500,
                'Não foi possível cancelar o item.'
            );
        }
    },

    // =====================================================
    // REGISTRAR PAGAMENTO
    // POST /comandas/:id/pagamentos
    // =====================================================
    async registrarPagamento(request, response) {
        const estabelecimentoId = request.estabelecimentoId;
        const comandaId = request.params.id;

        const {
            valor,
            forma_pagamento,
            observacao,
        } = request.body || {};

        const valorCentavos = dinheiroParaCentavos(valor);

        const formasPermitidas = [
            'DINHEIRO',
            'PIX',
            'CARTAO_CREDITO',
            'CARTAO_DEBITO',
            'TRANSFERENCIA',
            'OUTRO',
        ];

        if (valorCentavos === null || valorCentavos <= 0) {
            return erro(response, 400, 'Informe um valor de pagamento válido.');
        }

        if (!formasPermitidas.includes(forma_pagamento)) {
            return erro(response, 400, 'Forma de pagamento inválida.');
        }

        if (
            observacao != null &&
            (typeof observacao !== 'string' || observacao.length > 500)
        ) {
            return erro(response, 400, 'Observação do pagamento inválida.');
        }

        try {
            const resultado = await connection.transaction(async (trx) => {
                const comanda = await trx('mv_comandas')
                    .where({
                        id: comandaId,
                        estabelecimento_id: estabelecimentoId,
                    })
                    .forUpdate()
                    .first();

                if (!comanda) {
                    throw new Error('COMANDA_NAO_ENCONTRADA');
                }

                if (comanda.status !== 'ABERTA') {
                    throw new Error('COMANDA_FECHADA');
                }

                const comandaAtualizada = await recalcularComanda(
                    trx,
                    comandaId,
                    estabelecimentoId
                );

                const totalPago = await obterTotalPago(trx, comandaId);
                const saldo = comandaAtualizada.totalCentavos - totalPago;

                if (saldo <= 0) {
                    throw new Error('COMANDA_QUITADA');
                }

                if (valorCentavos > saldo) {
                    throw new Error('PAGAMENTO_MAIOR_QUE_SALDO');
                }

                const pagamento = {
                    id: crypto.randomUUID(),
                    comanda_id: comandaId,
                    valor: valorEmReais(valorCentavos),
                    forma_pagamento,
                    status: 'CONFIRMADO',
                    observacao: observacao ? observacao.trim() : null,
                    registrado_por: request.user?.id || null,
                    created_at: trx.fn.now(),
                };

                await trx('mv_pagamentos').insert(pagamento);

                // Recupera o pagamento já gravado no MySQL.
                const pagamentoRegistrado = await trx('mv_pagamentos')
                    .where({
                        id: pagamento.id,
                        comanda_id: comandaId,
                    })
                    .first();

                const novoTotalPago = totalPago + valorCentavos;
                
                const novoSaldo = comandaAtualizada.totalCentavos - novoTotalPago;

                if (novoSaldo === 0) {
                    await trx('mv_comandas')
                        .where({
                            id: comandaId,
                            estabelecimento_id: estabelecimentoId,
                        })
                        .update({
                            status: 'FECHADA',
                            fechada_em: trx.fn.now(),
                            updated_at: trx.fn.now(),
                        });
                }

                return {
                    pagamento: pagamentoRegistrado,
                    total: valorEmReais(comandaAtualizada.totalCentavos),
                    total_pago: valorEmReais(novoTotalPago),
                    saldo_devedor: valorEmReais(novoSaldo),
                    comanda_fechada: novoSaldo === 0,
                };
            });

            return response.status(201).json({
                status: true,
                message: resultado.comanda_fechada
                    ? 'Pagamento registrado. Comanda quitada e fechada.'
                    : 'Pagamento parcial registrado com sucesso.',
                dados: resultado,
            });
        } catch (error) {
            const erros = {
                COMANDA_NAO_ENCONTRADA: [
                    404,
                    'Comanda não encontrada.',
                ],
                COMANDA_FECHADA: [
                    400,
                    'Esta comanda já está fechada.',
                ],
                COMANDA_QUITADA: [
                    400,
                    'Esta comanda já está quitada.',
                ],
                PAGAMENTO_MAIOR_QUE_SALDO: [
                    400,
                    'O pagamento não pode ser maior que o saldo devedor.',
                ],
            };

            if (erros[error.message]) {
                return erro(response, ...erros[error.message]);
            }

            console.error('Erro ao registrar pagamento:', error);

            return erro(response, 500, 'Não foi possível registrar o pagamento.');
        }
    },

    // =====================================================
    // FECHAR COMANDA QUITADA
    // POST /comandas/:id/fechar
    // =====================================================
    async fechar(request, response) {
        const estabelecimentoId = request.estabelecimentoId;
        const comandaId = request.params.id;

        try {
            await connection.transaction(async (trx) => {
                const comanda = await trx('mv_comandas')
                    .where({
                        id: comandaId,
                        estabelecimento_id: estabelecimentoId,
                    })
                    .forUpdate()
                    .first();

                if (!comanda) {
                    throw new Error('COMANDA_NAO_ENCONTRADA');
                }

                if (comanda.status !== 'ABERTA') {
                    throw new Error('COMANDA_FECHADA');
                }

                const atualizada = await recalcularComanda(
                    trx,
                    comandaId,
                    estabelecimentoId
                );

                const totalPago = await obterTotalPago(trx, comandaId);

                if (totalPago < atualizada.totalCentavos) {
                    throw new Error('SALDO_PENDENTE');
                }

                await trx('mv_comandas')
                    .where({
                        id: comandaId,
                        estabelecimento_id: estabelecimentoId,
                    })
                    .update({
                        status: 'FECHADA',
                        fechada_em: trx.fn.now(),
                        updated_at: trx.fn.now(),
                    });
            });

            return response.json({
                status: true,
                message: 'Comanda fechada com sucesso.',
            });
        } catch (error) {
            const erros = {
                COMANDA_NAO_ENCONTRADA: [
                    404,
                    'Comanda não encontrada.',
                ],
                COMANDA_FECHADA: [
                    400,
                    'Esta comanda já está fechada.',
                ],
                SALDO_PENDENTE: [
                    400,
                    'A comanda possui saldo pendente. Registre o pagamento antes de fechar.',
                ],
            };

            if (erros[error.message]) {
                return erro(response, ...erros[error.message]);
            }

            console.error('Erro ao fechar comanda:', error);

            return erro(response, 500, 'Não foi possível fechar a comanda.');
        }
    },
};
