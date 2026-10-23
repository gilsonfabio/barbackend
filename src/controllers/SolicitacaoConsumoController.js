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

    const resultado = await trx('mv_itens_comanda')
        .where({
            comanda_id: comandaId,
            status: 'ATIVO',
        })
        .sum({ subtotal: 'subtotal' })
        .first();

    const subtotal = dinheiroParaCentavos(resultado?.subtotal || 0) || 0;
    const taxa = dinheiroParaCentavos(comanda.taxa_servico || 0) || 0;
    const desconto = dinheiroParaCentavos(comanda.desconto || 0) || 0;
    const total = Math.max(0, subtotal + taxa - desconto);

    await trx('mv_comandas')
        .where({
            id: comandaId,
            estabelecimento_id: estabelecimentoId,
        })
        .update({
            subtotal: valorEmReais(subtotal),
            total: valorEmReais(total),
            updated_at: trx.fn.now(),
        });

    return {
        subtotal: valorEmReais(subtotal),
        total: valorEmReais(total),
    };
}

module.exports = {
    // =====================================================
    // CLIENTE ENVIA SOLICITAÇÃO PELO CARDÁPIO QR CODE
    // POST /cardapio/:slug/solicitacoes-consumo
    // =====================================================
    async criarPublico(request, response) {
        const { slug } = request.params;

        const {
            mesa_id,
            cliente_nome,
            observacao,
            itens,
        } = request.body || {};

        if (typeof slug !== 'string' || !slug.trim()) {
            return erro(response, 400, 'Estabelecimento inválido.');
        }

        if (typeof mesa_id !== 'string' || !mesa_id.trim()) {
            return erro(
                response,
                400,
                'Não foi possível identificar a mesa pelo cardápio QR Code.'
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

        if (!Array.isArray(itens) || itens.length === 0 || itens.length > 50) {
            return erro(
                response,
                400,
                'Informe entre 1 e 50 itens na solicitação.'
            );
        }

        const itensNormalizados = [];

        for (const item of itens) {
            if (
                !item ||
                typeof item.produto_id !== 'string' ||
                !item.produto_id.trim()
            ) {
                return erro(response, 400, 'Existe um produto inválido.');
            }

            const quantidade = Number(item.quantidade);

            if (
                !Number.isInteger(quantidade) ||
                quantidade < 1 ||
                quantidade > 999
            ) {
                return erro(
                    response,
                    400,
                    'A quantidade de cada item deve estar entre 1 e 999.'
                );
            }

            if (
                item.observacao != null &&
                (
                    typeof item.observacao !== 'string' ||
                    item.observacao.length > 500
                )
            ) {
                return erro(response, 400, 'Observação de item inválida.');
            }

            itensNormalizados.push({
                produto_id: item.produto_id.trim(),
                quantidade,
                observacao: item.observacao
                    ? item.observacao.trim()
                    : null,
            });
        }

        try {
            const resultado = await connection.transaction(async (trx) => {
                const estabelecimento = await trx('mv_estabelecimentos')
                    .where({ slug: slug.trim(), status: 'ATIVO' })
                    .first();

                if (!estabelecimento) {
                    throw new Error('ESTABELECIMENTO_INVALIDO');
                }

                // Bloqueia a mesa durante a criação da solicitação.
                const mesa = await trx('mv_mesas')
                    .where({
                        id: mesa_id.trim(),
                        estabelecimento_id: estabelecimento.id,
                        status: 'ATIVA',
                    })
                    .forUpdate()
                    .first();

                if (!mesa) {
                    throw new Error('MESA_INVALIDA');
                }

                const solicitacaoId = crypto.randomUUID();
                const agora = trx.fn.now();

                await trx('mv_solicitacoes_consumo').insert({
                    id: solicitacaoId,
                    estabelecimento_id: estabelecimento.id,
                    mesa_id: mesa.id,
                    cliente_nome: cliente_nome
                        ? cliente_nome.trim()
                        : null,
                    observacao: observacao
                        ? observacao.trim()
                        : null,
                    status: 'PENDENTE',
                    created_at: agora,
                    updated_at: agora,
                });

                // Agrupa produtos repetidos para guardar uma linha por produto
                // quando as observações forem iguais.
                const grupos = new Map();

                for (const item of itensNormalizados) {
                    const chave = JSON.stringify([
                        item.produto_id,
                        item.observacao,
                    ]);

                    const existente = grupos.get(chave);

                    if (existente) {
                        existente.quantidade += item.quantidade;
                    } else {
                        grupos.set(chave, { ...item });
                    }
                }

                const itensParaSalvar = [];

                for (const item of grupos.values()) {
                    const produto = await trx('mv_produtos')
                        .where({
                            id: item.produto_id,
                            estabelecimento_id: estabelecimento.id,
                            ativo: 1,
                        })
                        .first();

                    if (!produto) {
                        throw new Error('PRODUTO_INDISPONIVEL');
                    }

                    const precoCentavos =
                        dinheiroParaCentavos(produto.preco);

                    if (precoCentavos === null) {
                        throw new Error('PRECO_INVALIDO');
                    }

                    const subtotalCentavos =
                        precoCentavos * item.quantidade;

                    if (!Number.isSafeInteger(subtotalCentavos)) {
                        throw new Error('SUBTOTAL_INVALIDO');
                    }

                    itensParaSalvar.push({
                        id: crypto.randomUUID(),
                        solicitacao_id: solicitacaoId,
                        produto_id: produto.id,
                        produto_nome: produto.nome,
                        preco_unitario: valorEmReais(precoCentavos),
                        quantidade: item.quantidade,
                        subtotal: valorEmReais(subtotalCentavos),
                        observacao: item.observacao,
                        created_at: agora,
                        updated_at: agora,
                    });
                }

                await trx('mv_itens_solicitacao_consumo')
                    .insert(itensParaSalvar);

                return {
                    id: solicitacaoId,
                    mesa_numero: mesa.numero,
                    status: 'PENDENTE',
                };
            });

            return response.status(201).json({
                status: true,
                message: 'Solicitação enviada. Aguarde a confirmação do garçom.',
                dados: resultado,
            });
        } catch (error) {
            if (error.message === 'ESTABELECIMENTO_INVALIDO') {
                return erro(response, 404, 'Estabelecimento não encontrado.');
            }

            if (error.message === 'MESA_INVALIDA') {
                return erro(response, 400, 'Mesa inválida ou inativa.');
            }

            if (error.message === 'PRODUTO_INDISPONIVEL') {
                return erro(
                    response,
                    400,
                    'Um ou mais produtos estão indisponíveis.'
                );
            }

            if (error.message === 'PRECO_INVALIDO') {
                return erro(response, 400, 'Existe um produto com preço inválido.');
            }

            if (error.message === 'SUBTOTAL_INVALIDO') {
                return erro(response, 400, 'Não foi possível calcular os itens.');
            }

            console.error('Erro ao criar solicitação de consumo:', error);

            return erro(
                response,
                500,
                'Não foi possível enviar a solicitação.'
            );
        }
    },

    // =====================================================
    // GARÇOM LISTA SOLICITAÇÕES
    // GET /solicitacoes-consumo
    // =====================================================
    async listar(request, response) {
        try {
            const estabelecimentoId = request.estabelecimentoId;
            const status = request.query.status || 'PENDENTE';

            const statusPermitidos = [
                'PENDENTE',
                'CONFIRMADA',
                'REJEITADA',
            ];

            if (!statusPermitidos.includes(status)) {
                return erro(response, 400, 'Status de solicitação inválido.');
            }

            const solicitacoes = await connection(
                'mv_solicitacoes_consumo as s'
            )
                .join('mv_mesas as m', 'm.id', 's.mesa_id')
                .where({
                    's.estabelecimento_id': estabelecimentoId,
                    's.status': status,
                })
                .select(
                    's.id',
                    's.mesa_id',
                    'm.numero as mesa_numero',
                    's.cliente_nome',
                    's.observacao',
                    's.status',
                    's.confirmado_por',
                    's.confirmado_em',
                    's.rejeitado_por',
                    's.rejeitado_em',
                    's.created_at'
                )
                .orderBy('s.created_at', 'asc');

            for (const solicitacao of solicitacoes) {
                solicitacao.itens =
                    await connection('mv_itens_solicitacao_consumo')
                        .where({
                            solicitacao_id: solicitacao.id,
                        })
                        .orderBy('created_at', 'asc');
            }

            return response.json({
                status: true,
                dados: solicitacoes,
            });
        } catch (error) {
            console.error('Erro ao listar solicitações:', error);

            return erro(
                response,
                500,
                'Não foi possível listar as solicitações.'
            );
        }
    },

    // =====================================================
    // GARÇOM CONFIRMA E LANÇA NA COMANDA
    // POST /solicitacoes-consumo/:id/confirmar
    // =====================================================
    async confirmar(request, response) {
        const estabelecimentoId = request.estabelecimentoId;
        const solicitacaoId = request.params.id;

        try {
            const resultado = await connection.transaction(async (trx) => {
                const solicitacao = await trx('mv_solicitacoes_consumo')
                    .where({
                        id: solicitacaoId,
                        estabelecimento_id: estabelecimentoId,
                    })
                    .forUpdate()
                    .first();

                if (!solicitacao) {
                    throw new Error('SOLICITACAO_NAO_ENCONTRADA');
                }

                if (solicitacao.status !== 'PENDENTE') {
                    throw new Error('SOLICITACAO_JA_PROCESSADA');
                }

                // Serializa a abertura/reutilização de comandas da mesma mesa.
                const mesa = await trx('mv_mesas')
                    .where({
                        id: solicitacao.mesa_id,
                        estabelecimento_id: estabelecimentoId,
                        status: 'ATIVA',
                    })
                    .forUpdate()
                    .first();

                if (!mesa) {
                    throw new Error('MESA_INVALIDA');
                }

                let comanda = await trx('mv_comandas')
                    .where({
                        estabelecimento_id: estabelecimentoId,
                        mesa_id: mesa.id,
                        tipo: 'MESA',
                        status: 'ABERTA',
                    })
                    .forUpdate()
                    .first();

                if (!comanda) {
                    const comandaId = crypto.randomUUID();

                    await trx('mv_comandas').insert({
                        id: comandaId,
                        estabelecimento_id: estabelecimentoId,
                        mesa_id: mesa.id,
                        codigo: gerarCodigoComanda(),
                        tipo: 'MESA',
                        cliente_nome: solicitacao.cliente_nome,
                        status: 'ABERTA',
                        subtotal: '0.00',
                        taxa_servico: '0.00',
                        desconto: '0.00',
                        total: '0.00',
                        observacao: solicitacao.observacao,
                        aberta_em: trx.fn.now(),
                        created_at: trx.fn.now(),
                        updated_at: trx.fn.now(),
                    });

                    comanda = await trx('mv_comandas')
                        .where({
                            id: comandaId,
                            estabelecimento_id: estabelecimentoId,
                        })
                        .first();
                }

                const itensSolicitados =
                    await trx('mv_itens_solicitacao_consumo')
                        .where({ solicitacao_id: solicitacaoId })
                        .orderBy('created_at', 'asc');

                if (itensSolicitados.length === 0) {
                    throw new Error('SOLICITACAO_SEM_ITENS');
                }

                for (const item of itensSolicitados) {
                    const produto = await trx('mv_produtos')
                        .where({
                            id: item.produto_id,
                            estabelecimento_id: estabelecimentoId,
                            ativo: 1,
                        })
                        .first();

                    if (!produto) {
                        throw new Error('PRODUTO_INDISPONIVEL');
                    }

                    // Revalida o preço atual do produto no momento da confirmação.
                    const precoCentavos =
                        dinheiroParaCentavos(produto.preco);

                    if (precoCentavos === null) {
                        throw new Error('PRECO_INVALIDO');
                    }

                    const subtotalCentavos =
                        precoCentavos * Number(item.quantidade);

                    if (!Number.isSafeInteger(subtotalCentavos)) {
                        throw new Error('SUBTOTAL_INVALIDO');
                    }

                    await trx('mv_itens_comanda').insert({
                        id: crypto.randomUUID(),
                        comanda_id: comanda.id,
                        produto_id: produto.id,
                        produto_nome: produto.nome,
                        preco_unitario: valorEmReais(precoCentavos),
                        quantidade: Number(item.quantidade),
                        subtotal: valorEmReais(subtotalCentavos),
                        observacao: item.observacao,
                        status: 'ATIVO',
                        created_at: trx.fn.now(),
                        updated_at: trx.fn.now(),
                    });
                }

                const totais = await recalcularComanda(
                    trx,
                    comanda.id,
                    estabelecimentoId
                );

                await trx('mv_solicitacoes_consumo')
                    .where({
                        id: solicitacaoId,
                        estabelecimento_id: estabelecimentoId,
                        status: 'PENDENTE',
                    })
                    .update({
                        status: 'CONFIRMADA',
                        confirmado_por: request.user?.id || null,
                        confirmado_em: trx.fn.now(),
                        updated_at: trx.fn.now(),
                    });

                return {
                    solicitacao_id: solicitacaoId,
                    comanda_id: comanda.id,
                    codigo_comanda: comanda.codigo,
                    mesa_numero: mesa.numero,
                    subtotal: totais.subtotal,
                    total: totais.total,
                };
            });

            return response.json({
                status: true,
                message: 'Solicitação confirmada e itens lançados na comanda.',
                dados: resultado,
            });
        } catch (error) {
            const erros = {
                SOLICITACAO_NAO_ENCONTRADA: [
                    404,
                    'Solicitação não encontrada.',
                ],
                SOLICITACAO_JA_PROCESSADA: [
                    409,
                    'Esta solicitação já foi confirmada ou rejeitada.',
                ],
                MESA_INVALIDA: [
                    400,
                    'A mesa está inativa ou não pertence ao estabelecimento.',
                ],
                SOLICITACAO_SEM_ITENS: [
                    400,
                    'A solicitação não possui itens.',
                ],
                PRODUTO_INDISPONIVEL: [
                    400,
                    'Um produto não está mais disponível. A solicitação não foi confirmada.',
                ],
                PRECO_INVALIDO: [
                    400,
                    'Um produto possui preço inválido.',
                ],
                SUBTOTAL_INVALIDO: [
                    400,
                    'Não foi possível calcular o subtotal.',
                ],
            };

            if (erros[error.message]) {
                return erro(response, ...erros[error.message]);
            }

            console.error('Erro ao confirmar solicitação:', error);

            return erro(
                response,
                500,
                'Não foi possível confirmar a solicitação.'
            );
        }
    },

    // =====================================================
    // GARÇOM REJEITA SOLICITAÇÃO
    // POST /solicitacoes-consumo/:id/rejeitar
    // =====================================================
    async rejeitar(request, response) {
        const estabelecimentoId = request.estabelecimentoId;
        const solicitacaoId = request.params.id;

        try {
            const atualizadas = await connection.transaction(async (trx) => {
                const solicitacao = await trx('mv_solicitacoes_consumo')
                    .where({
                        id: solicitacaoId,
                        estabelecimento_id: estabelecimentoId,
                    })
                    .forUpdate()
                    .first();

                if (!solicitacao) {
                    throw new Error('SOLICITACAO_NAO_ENCONTRADA');
                }

                if (solicitacao.status !== 'PENDENTE') {
                    throw new Error('SOLICITACAO_JA_PROCESSADA');
                }

                return trx('mv_solicitacoes_consumo')
                    .where({
                        id: solicitacaoId,
                        estabelecimento_id: estabelecimentoId,
                        status: 'PENDENTE',
                    })
                    .update({
                        status: 'REJEITADA',
                        rejeitado_por: request.user?.id || null,
                        rejeitado_em: trx.fn.now(),
                        updated_at: trx.fn.now(),
                    });
            });

            if (!atualizadas) {
                return erro(
                    response,
                    409,
                    'A solicitação já foi processada.'
                );
            }

            return response.json({
                status: true,
                message: 'Solicitação rejeitada.',
            });
        } catch (error) {
            if (error.message === 'SOLICITACAO_NAO_ENCONTRADA') {
                return erro(response, 404, 'Solicitação não encontrada.');
            }

            if (error.message === 'SOLICITACAO_JA_PROCESSADA') {
                return erro(
                    response,
                    409,
                    'Esta solicitação já foi confirmada ou rejeitada.'
                );
            }

            console.error('Erro ao rejeitar solicitação:', error);

            return erro(
                response,
                500,
                'Não foi possível rejeitar a solicitação.'
            );
        }
    },
};
