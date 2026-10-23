const { randomUUID } = require('crypto');
const db = require('../database/connection');

function responderNaoEncontrado(response) {
    return response.status(404).json({
        status: false,
        message: 'Subcategoria não encontrada.',
    });
}

function validarNome(nome) {
    return (
        typeof nome === 'string' &&
        nome.trim().length > 0 &&
        nome.trim().length <= 100
    );
}

function normalizarAtivo(valor) {
    if (valor === true || valor === 1 || valor === '1') {
        return 1;
    }

    if (valor === false || valor === 0 || valor === '0') {
        return 0;
    }

    return null;
}

async function buscarCategoria(
    trx,
    categoriaId,
    estabelecimentoId
) {
    if (
        typeof categoriaId !== 'string' ||
        categoriaId.trim() === ''
    ) {
        return null;
    }

    return trx('mv_categorias')
        .where({
            id: categoriaId,
            estabelecimento_id: estabelecimentoId,
        })
        .first();
}

module.exports = {
    // =====================================================
    // LISTAR SUBCATEGORIAS
    // GET /subcategorias
    // GET /subcategorias?categoria_id=...
    // GET /subcategorias?ativo=1
    // =====================================================
    async listar(request, response) {
        try {
            const estabelecimentoId = request.estabelecimentoId;

            const consulta = db('mv_subcategorias as s')
                .join('mv_categorias as c', function () {
                    this.on('c.id', '=', 's.categoria_id')
                        .andOn(
                            'c.estabelecimento_id',
                            '=',
                            's.estabelecimento_id'
                        );
                })
                .where(
                    's.estabelecimento_id',
                    estabelecimentoId
                )
                .select(
                    's.id',
                    's.estabelecimento_id',
                    's.categoria_id',
                    'c.nome as categoria_nome',
                    's.nome',
                    's.descricao',
                    's.ordem',
                    's.ativo',
                    's.created_at',
                    's.updated_at'
                );

            if (request.query.categoria_id) {
                consulta.where(
                    's.categoria_id',
                    request.query.categoria_id
                );
            }

            if (
                request.query.ativo === '0' ||
                request.query.ativo === '1'
            ) {
                consulta.where(
                    's.ativo',
                    Number(request.query.ativo)
                );
            }

            const subcategorias = await consulta
                .orderBy('s.ordem', 'asc')
                .orderBy('s.nome', 'asc');

            return response.status(200).json({
                status: true,
                dados: subcategorias,
            });
        } catch (erro) {
            console.error(
                'Erro ao listar subcategorias:',
                erro.message
            );

            return response.status(500).json({
                status: false,
                message: 'Erro ao listar subcategorias.',
            });
        }
    },

    // =====================================================
    // CONSULTAR SUBCATEGORIA
    // GET /subcategorias/:id
    // =====================================================
    async consultar(request, response) {
        try {
            const subcategoria = await db('mv_subcategorias as s')
                .join('mv_categorias as c', function () {
                    this.on('c.id', '=', 's.categoria_id')
                        .andOn(
                            'c.estabelecimento_id',
                            '=',
                            's.estabelecimento_id'
                        );
                })
                .where({
                    's.id': request.params.id,
                    's.estabelecimento_id':
                        request.estabelecimentoId,
                })
                .select(
                    's.id',
                    's.estabelecimento_id',
                    's.categoria_id',
                    'c.nome as categoria_nome',
                    's.nome',
                    's.descricao',
                    's.ordem',
                    's.ativo',
                    's.created_at',
                    's.updated_at'
                )
                .first();

            if (!subcategoria) {
                return responderNaoEncontrado(response);
            }

            return response.status(200).json({
                status: true,
                dados: subcategoria,
            });
        } catch (erro) {
            console.error(
                'Erro ao consultar subcategoria:',
                erro.message
            );

            return response.status(500).json({
                status: false,
                message: 'Erro ao consultar subcategoria.',
            });
        }
    },

    // =====================================================
    // CADASTRAR SUBCATEGORIA
    // POST /subcategorias
    // =====================================================
    async cadastrar(request, response) {
        try {
            const {
                categoria_id,
                nome,
                descricao,
                ordem,
            } = request.body;

            const estabelecimentoId =
                request.estabelecimentoId;

            if (!validarNome(nome)) {
                return response.status(400).json({
                    status: false,
                    message:
                        'Informe um nome com até 100 caracteres.',
                });
            }

            if (
                categoria_id === undefined ||
                categoria_id === null ||
                typeof categoria_id !== 'string' ||
                categoria_id.trim() === ''
            ) {
                return response.status(400).json({
                    status: false,
                    message: 'Informe a categoria da subcategoria.',
                });
            }

            if (
                descricao !== undefined &&
                descricao !== null &&
                typeof descricao !== 'string'
            ) {
                return response.status(400).json({
                    status: false,
                    message: 'A descrição deve ser um texto.',
                });
            }

            const ordemFinal =
                ordem === undefined ? 0 : Number(ordem);

            if (
                !Number.isInteger(ordemFinal) ||
                ordemFinal < 0
            ) {
                return response.status(400).json({
                    status: false,
                    message:
                        'A ordem deve ser um inteiro não negativo.',
                });
            }

            const dataAtual = new Date();

            const subcategoria = {
                id: randomUUID(),
                estabelecimento_id: estabelecimentoId,
                categoria_id: categoria_id.trim(),
                nome: nome.trim(),
                descricao:
                    typeof descricao === 'string'
                        ? descricao.trim() || null
                        : null,
                ordem: ordemFinal,
                ativo: 1,
                created_at: dataAtual,
                updated_at: dataAtual,
            };

            await db.transaction(async (trx) => {
                const categoria = await buscarCategoria(
                    trx,
                    subcategoria.categoria_id,
                    estabelecimentoId
                );

                if (!categoria) {
                    const erro = new Error(
                        'A categoria não pertence ao estabelecimento.'
                    );
                    erro.status = 400;
                    throw erro;
                }

                await trx('mv_subcategorias').insert(
                    subcategoria
                );
            });

            return response.status(201).json({
                status: true,
                message: 'Subcategoria cadastrada com sucesso.',
                dados: subcategoria,
            });
        } catch (erro) {
            if (erro.status === 400) {
                return response.status(400).json({
                    status: false,
                    message: erro.message,
                });
            }

            console.error(
                'Erro ao cadastrar subcategoria:',
                erro.message
            );

            return response.status(500).json({
                status: false,
                message: 'Erro ao cadastrar subcategoria.',
            });
        }
    },

    // =====================================================
    // ATUALIZAR SUBCATEGORIA
    // PUT /subcategorias/:id
    // =====================================================
    async atualizar(request, response) {
        try {
            const {
                categoria_id,
                nome,
                descricao,
                ordem,
            } = request.body;

            const estabelecimentoId =
                request.estabelecimentoId;

            const atualizacao = {};

            if (nome !== undefined) {
                if (!validarNome(nome)) {
                    return response.status(400).json({
                        status: false,
                        message:
                            'Informe um nome com até 100 caracteres.',
                    });
                }

                atualizacao.nome = nome.trim();
            }

            if (descricao !== undefined) {
                if (
                    descricao !== null &&
                    typeof descricao !== 'string'
                ) {
                    return response.status(400).json({
                        status: false,
                        message: 'A descrição deve ser um texto.',
                    });
                }

                atualizacao.descricao =
                    typeof descricao === 'string'
                        ? descricao.trim() || null
                        : null;
            }

            if (ordem !== undefined) {
                const ordemFinal = Number(ordem);

                if (
                    !Number.isInteger(ordemFinal) ||
                    ordemFinal < 0
                ) {
                    return response.status(400).json({
                        status: false,
                        message:
                            'A ordem deve ser um inteiro não negativo.',
                    });
                }

                atualizacao.ordem = ordemFinal;
            }

            if (categoria_id !== undefined) {
                if (
                    typeof categoria_id !== 'string' ||
                    categoria_id.trim() === ''
                ) {
                    return response.status(400).json({
                        status: false,
                        message: 'Informe uma categoria válida.',
                    });
                }

                atualizacao.categoria_id = categoria_id.trim();
            }

            if (Object.keys(atualizacao).length === 0) {
                return response.status(400).json({
                    status: false,
                    message:
                        'Informe ao menos um campo para atualizar.',
                });
            }

            const subcategoria = await db('mv_subcategorias')
                .where({
                    id: request.params.id,
                    estabelecimento_id: estabelecimentoId,
                })
                .first();

            if (!subcategoria) {
                return responderNaoEncontrado(response);
            }

            await db.transaction(async (trx) => {
                if (atualizacao.categoria_id !== undefined) {
                    const categoria = await buscarCategoria(
                        trx,
                        atualizacao.categoria_id,
                        estabelecimentoId
                    );

                    if (!categoria) {
                        const erro = new Error(
                            'A categoria não pertence ao estabelecimento.'
                        );
                        erro.status = 400;
                        throw erro;
                    }
                }

                atualizacao.updated_at = new Date();

                await trx('mv_subcategorias')
                    .where({
                        id: request.params.id,
                        estabelecimento_id: estabelecimentoId,
                    })
                    .update(atualizacao);
            });

            const subcategoriaAtualizada =
                await db('mv_subcategorias')
                    .where({
                        id: request.params.id,
                        estabelecimento_id: estabelecimentoId,
                    })
                    .first();

            return response.status(200).json({
                status: true,
                message: 'Subcategoria atualizada com sucesso.',
                dados: subcategoriaAtualizada,
            });
        } catch (erro) {
            if (erro.status === 400) {
                return response.status(400).json({
                    status: false,
                    message: erro.message,
                });
            }

            console.error(
                'Erro ao atualizar subcategoria:',
                erro.message
            );

            return response.status(500).json({
                status: false,
                message: 'Erro ao atualizar subcategoria.',
            });
        }
    },

    // =====================================================
    // ATIVAR OU DESATIVAR SUBCATEGORIA
    // PATCH /subcategorias/:id/ativar
    // =====================================================
    async alterarStatus(request, response) {
        try {
            const ativo = normalizarAtivo(request.body.ativo);

            if (ativo === null) {
                return response.status(400).json({
                    status: false,
                    message:
                        'Informe ativo como true, false, 1 ou 0.',
                });
            }

            const filtro = {
                id: request.params.id,
                estabelecimento_id: request.estabelecimentoId,
            };

            const subcategoria = await db('mv_subcategorias')
                .where(filtro)
                .first();

            if (!subcategoria) {
                return responderNaoEncontrado(response);
            }

            await db('mv_subcategorias')
                .where(filtro)
                .update({
                    ativo,
                    updated_at: new Date(),
                });

            return response.status(200).json({
                status: true,
                message: ativo
                    ? 'Subcategoria ativada com sucesso.'
                    : 'Subcategoria desativada com sucesso.',
            });
        } catch (erro) {
            console.error(
                'Erro ao alterar status da subcategoria:',
                erro.message
            );

            return response.status(500).json({
                status: false,
                message:
                    'Erro ao alterar status da subcategoria.',
            });
        }
    },
};
