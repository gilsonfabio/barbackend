const { randomUUID } = require('crypto');
const db = require('../database/connection');

function erroValidacao(message, status = 400) {
    const erro = new Error(message);
    erro.status = status;
    return erro;
}

function validarNumero(numero) {
    return (
        typeof numero === 'string' &&
        numero.trim().length > 0 &&
        numero.trim().length <= 30
    );
}

function validarStatus(status) {
    if (status === undefined) return null;

    if (status === 'ATIVA' || status === 'INATIVA') {
        return status;
    }

    return undefined;
}

function codigoQR() {
    // Código aleatório, sem expor o ID interno da mesa.
    return randomUUID().replace(/-/g, '') +
        randomUUID().replace(/-/g, '').slice(0, 16);
}

function formatarMesa(mesa) {
    return {
        id: mesa.id,
        estabelecimento_id: mesa.estabelecimento_id,
        numero: mesa.numero,
        codigo_qr: mesa.codigo_qr,
        status: mesa.status,
        created_at: mesa.created_at,
        updated_at: mesa.updated_at,
    };
}

module.exports = {
    // =====================================================
    // LISTAR MESAS
    // =====================================================
    async listar(request, response) {
        try {
            const consulta = db('mv_mesas')
                .where(
                    'estabelecimento_id',
                    request.estabelecimentoId
                );

            if (request.query.status === 'ATIVA' ||
                request.query.status === 'INATIVA') {
                consulta.where('status', request.query.status);
            }

            const mesas = await consulta
                .orderBy('numero', 'asc');

            return response.status(200).json({
                status: true,
                dados: mesas.map(formatarMesa),
            });
        } catch (erro) {
            console.error('Erro ao listar mesas:', erro.message);

            return response.status(500).json({
                status: false,
                message: 'Erro ao listar mesas.',
            });
        }
    },

    // =====================================================
    // CONSULTAR MESA
    // =====================================================
    async consultar(request, response) {
        try {
            const mesa = await db('mv_mesas')
                .where({
                    id: request.params.id,
                    estabelecimento_id: request.estabelecimentoId,
                })
                .first();

            if (!mesa) {
                return response.status(404).json({
                    status: false,
                    message: 'Mesa não encontrada.',
                });
            }

            return response.status(200).json({
                status: true,
                dados: formatarMesa(mesa),
            });
        } catch (erro) {
            console.error('Erro ao consultar mesa:', erro.message);

            return response.status(500).json({
                status: false,
                message: 'Erro ao consultar mesa.',
            });
        }
    },

    // =====================================================
    // CADASTRAR MESA INDIVIDUAL
    // =====================================================
    async cadastrar(request, response) {
        try {
            const { numero } = request.body;

            if (!validarNumero(numero)) {
                return response.status(400).json({
                    status: false,
                    message:
                        'Informe a identificação da mesa, com até 30 caracteres.',
                });
            }

            const estabelecimentoId = request.estabelecimentoId;
            const numeroFinal = numero.trim();

            const existente = await db('mv_mesas')
                .where({
                    estabelecimento_id: estabelecimentoId,
                    numero: numeroFinal,
                })
                .first();

            if (existente) {
                return response.status(409).json({
                    status: false,
                    message:
                        'Já existe uma mesa com essa identificação.',
                });
            }

            const agora = new Date();

            const mesa = {
                id: randomUUID(),
                estabelecimento_id: estabelecimentoId,
                numero: numeroFinal,
                codigo_qr: codigoQR(),
                status: 'ATIVA',
                created_at: agora,
                updated_at: agora,
            };

            await db('mv_mesas').insert(mesa);

            return response.status(201).json({
                status: true,
                message: 'Mesa cadastrada com sucesso.',
                dados: formatarMesa(mesa),
            });
        } catch (erro) {
            if (erro.code === 'ER_DUP_ENTRY') {
                return response.status(409).json({
                    status: false,
                    message:
                        'Já existe uma mesa com essa identificação ou código.',
                });
            }

            console.error('Erro ao cadastrar mesa:', erro.message);

            return response.status(500).json({
                status: false,
                message: 'Erro ao cadastrar mesa.',
            });
        }
    },

    // =====================================================
    // GERAR MESAS EM LOTE
    // =====================================================
    async gerarLote(request, response) {
        try {
            const quantidade = Number(request.body.quantidade);
            const inicio = request.body.inicio === undefined
                ? 1
                : Number(request.body.inicio);

            if (
                !Number.isInteger(quantidade) ||
                quantidade < 1 ||
                quantidade > 100
            ) {
                return response.status(400).json({
                    status: false,
                    message:
                        'A quantidade deve ser um inteiro entre 1 e 100.',
                });
            }

            if (
                !Number.isInteger(inicio) ||
                inicio < 1 ||
                inicio + quantidade - 1 > 999999
            ) {
                return response.status(400).json({
                    status: false,
                    message:
                        'O número inicial informado é inválido.',
                });
            }

            const estabelecimentoId = request.estabelecimentoId;
            const agora = new Date();

            const mesas = Array.from(
                { length: quantidade },
                (_, indice) => ({
                    id: randomUUID(),
                    estabelecimento_id: estabelecimentoId,
                    numero: String(inicio + indice),
                    codigo_qr: codigoQR(),
                    status: 'ATIVA',
                    created_at: agora,
                    updated_at: agora,
                })
            );

            await db.transaction(async (trx) => {
                const numeros = mesas.map((mesa) => mesa.numero);

                const existentes = await trx('mv_mesas')
                    .where('estabelecimento_id', estabelecimentoId)
                    .whereIn('numero', numeros)
                    .select('numero');

                if (existentes.length > 0) {
                    const lista = existentes
                        .map((mesa) => mesa.numero)
                        .join(', ');

                    throw erroValidacao(
                        `Já existem mesas com os números: ${lista}. Nenhuma mesa foi criada.`,
                        409
                    );
                }

                await trx('mv_mesas').insert(mesas);
            });

            return response.status(201).json({
                status: true,
                message: `${quantidade} mesa(s) criada(s) com sucesso.`,
                dados: mesas.map(formatarMesa),
            });
        } catch (erro) {
            if (erro.status === 409) {
                return response.status(409).json({
                    status: false,
                    message: erro.message,
                });
            }

            if (erro.code === 'ER_DUP_ENTRY') {
                return response.status(409).json({
                    status: false,
                    message:
                        'Uma ou mais mesas já existem. Nenhuma mesa foi criada.',
                });
            }

            console.error('Erro ao gerar mesas:', erro.message);

            return response.status(500).json({
                status: false,
                message: 'Erro ao gerar mesas.',
            });
        }
    },

    // =====================================================
    // ATUALIZAR IDENTIFICAÇÃO DA MESA
    // =====================================================
    async atualizar(request, response) {
        try {
            const { numero } = request.body;

            if (!validarNumero(numero)) {
                return response.status(400).json({
                    status: false,
                    message:
                        'Informe uma identificação válida de até 30 caracteres.',
                });
            }

            const estabelecimentoId = request.estabelecimentoId;
            const id = request.params.id;

            const mesa = await db('mv_mesas')
                .where({
                    id,
                    estabelecimento_id: estabelecimentoId,
                })
                .first();

            if (!mesa) {
                return response.status(404).json({
                    status: false,
                    message: 'Mesa não encontrada.',
                });
            }

            const numeroFinal = numero.trim();

            const duplicada = await db('mv_mesas')
                .where({
                    estabelecimento_id: estabelecimentoId,
                    numero: numeroFinal,
                })
                .whereNot('id', id)
                .first();

            if (duplicada) {
                return response.status(409).json({
                    status: false,
                    message:
                        'Já existe outra mesa com essa identificação.',
                });
            }

            await db('mv_mesas')
                .where({
                    id,
                    estabelecimento_id: estabelecimentoId,
                })
                .update({
                    numero: numeroFinal,
                    updated_at: new Date(),
                });

            const atualizada = await db('mv_mesas')
                .where({
                    id,
                    estabelecimento_id: estabelecimentoId,
                })
                .first();

            return response.status(200).json({
                status: true,
                message: 'Mesa atualizada com sucesso.',
                dados: formatarMesa(atualizada),
            });
        } catch (erro) {
            if (erro.code === 'ER_DUP_ENTRY') {
                return response.status(409).json({
                    status: false,
                    message:
                        'Já existe uma mesa com essa identificação.',
                });
            }

            console.error('Erro ao atualizar mesa:', erro.message);

            return response.status(500).json({
                status: false,
                message: 'Erro ao atualizar mesa.',
            });
        }
    },

    // =====================================================
    // ATIVAR OU DESATIVAR MESA
    // =====================================================
    async alterarStatus(request, response) {
        try {
            const status = validarStatus(request.body.status);

            if (status === undefined || status === null) {
                return response.status(400).json({
                    status: false,
                    message:
                        'Informe status como ATIVA ou INATIVA.',
                });
            }

            const resultado = await db('mv_mesas')
                .where({
                    id: request.params.id,
                    estabelecimento_id: request.estabelecimentoId,
                })
                .update({
                    status,
                    updated_at: new Date(),
                });

            if (!resultado) {
                return response.status(404).json({
                    status: false,
                    message: 'Mesa não encontrada.',
                });
            }

            return response.status(200).json({
                status: true,
                message: status === 'ATIVA'
                    ? 'Mesa ativada com sucesso.'
                    : 'Mesa desativada com sucesso.',
            });
        } catch (erro) {
            console.error(
                'Erro ao alterar status da mesa:',
                erro.message
            );

            return response.status(500).json({
                status: false,
                message: 'Erro ao alterar status da mesa.',
            });
        }
    },
};
