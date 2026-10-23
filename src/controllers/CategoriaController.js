const { randomUUID } = require('crypto');
const db = require('../database/connection');

function responderNaoEncontrado(response) {
    return response.status(404).json({
        status: false,
        message: 'Categoria não encontrada.',
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

module.exports = {
    // =====================================================
    // LISTAR CATEGORIAS DO ESTABELECIMENTO
    // =====================================================
    async listar(request, response) {
        try {
            const consulta = db('mv_categorias')
                .where({
                    estabelecimento_id: request.estabelecimentoId,
                })
                .select(
                    'id',
                    'nome',
                    'descricao',
                    'ordem',
                    'ativo',
                    'created_at',
                    'updated_at'
                );

            if (
                request.query.ativo === '0' ||
                request.query.ativo === '1'
            ) {
                consulta.where('ativo', Number(request.query.ativo));
            }

            const categorias = await consulta
                .orderBy('ordem', 'asc')
                .orderBy('nome', 'asc');

            return response.status(200).json({
                status: true,
                dados: categorias,
            });
        } catch (erro) {
            console.error('Erro ao listar categorias:', erro.message);

            return response.status(500).json({
                status: false,
                message: 'Erro ao listar categorias.',
            });
        }
    },

    // =====================================================
    // CONSULTAR UMA CATEGORIA
    // =====================================================
    async consultar(request, response) {
        try {
            const categoria = await db('mv_categorias')
                .where({
                    id: request.params.id,
                    estabelecimento_id: request.estabelecimentoId,
                })
                .first();

            if (!categoria) {
                return responderNaoEncontrado(response);
            }

            return response.status(200).json({
                status: true,
                dados: categoria,
            });
        } catch (erro) {
            console.error('Erro ao consultar categoria:', erro.message);

            return response.status(500).json({
                status: false,
                message: 'Erro ao consultar categoria.',
            });
        }
    },

    // =====================================================
    // CADASTRAR CATEGORIA
    // =====================================================
    async cadastrar(request, response) {
        try {
            const { nome, descricao, ordem } = request.body;

            if (!validarNome(nome)) {
                return response.status(400).json({
                    status: false,
                    message:
                        'Informe um nome com até 100 caracteres.',
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

            const ordemFinal = ordem === undefined ? 0 : Number(ordem);

            if (
                !Number.isInteger(ordemFinal) ||
                ordemFinal < 0
            ) {
                return response.status(400).json({
                    status: false,
                    message: 'A ordem deve ser um inteiro não negativo.',
                });
            }

            const dataAtual = new Date();

            const categoria = {
                id: randomUUID(),
                estabelecimento_id: request.estabelecimentoId,
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

            await db('mv_categorias').insert(categoria);

            return response.status(201).json({
                status: true,
                message: 'Categoria cadastrada com sucesso.',
                dados: categoria,
            });
        } catch (erro) {
            console.error('Erro ao cadastrar categoria:', erro.message);

            return response.status(500).json({
                status: false,
                message: 'Erro ao cadastrar categoria.',
            });
        }
    },

    // =====================================================
    // ATUALIZAR CATEGORIA
    // =====================================================
    async atualizar(request, response) {
        try {
            const { nome, descricao, ordem } = request.body;
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

            if (Object.keys(atualizacao).length === 0) {
                return response.status(400).json({
                    status: false,
                    message: 'Informe ao menos um campo para atualizar.',
                });
            }

            const categoria = await db('mv_categorias')
                .where({
                    id: request.params.id,
                    estabelecimento_id: request.estabelecimentoId,
                })
                .first();

            if (!categoria) {
                return responderNaoEncontrado(response);
            }

            atualizacao.updated_at = new Date();

            await db('mv_categorias')
                .where({
                    id: request.params.id,
                    estabelecimento_id: request.estabelecimentoId,
                })
                .update(atualizacao);

            const categoriaAtualizada = await db('mv_categorias')
                .where({
                    id: request.params.id,
                    estabelecimento_id: request.estabelecimentoId,
                })
                .first();

            return response.status(200).json({
                status: true,
                message: 'Categoria atualizada com sucesso.',
                dados: categoriaAtualizada,
            });
        } catch (erro) {
            console.error('Erro ao atualizar categoria:', erro.message);

            return response.status(500).json({
                status: false,
                message: 'Erro ao atualizar categoria.',
            });
        }
    },

    // =====================================================
    // ATIVAR OU DESATIVAR CATEGORIA
    // =====================================================
    async alterarStatus(request, response) {
        try {
            const ativo = normalizarAtivo(request.body.ativo);

            if (ativo === null) {
                return response.status(400).json({
                    status: false,
                    message: 'Informe ativo como true, false, 1 ou 0.',
                });
            }

            const categoria = await db('mv_categorias')
                .where({
                    id: request.params.id,
                    estabelecimento_id: request.estabelecimentoId,
                })
                .first();

            if (!categoria) {
                return responderNaoEncontrado(response);
            }

            await db('mv_categorias')
                .where({
                    id: request.params.id,
                    estabelecimento_id: request.estabelecimentoId,
                })
                .update({
                    ativo,
                    updated_at: new Date(),
                });

            return response.status(200).json({
                status: true,
                message: ativo
                    ? 'Categoria ativada com sucesso.'
                    : 'Categoria desativada com sucesso.',
            });
        } catch (erro) {
            console.error(
                'Erro ao alterar status da categoria:',
                erro.message
            );

            return response.status(500).json({
                status: false,
                message: 'Erro ao alterar status da categoria.',
            });
        }
    },
};
