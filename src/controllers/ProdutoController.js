const { randomUUID } = require('crypto');
const db = require('../database/connection');

function naoEncontrado(response) {
    return response.status(404).json({
        status: false,
        message: 'Produto não encontrado.',
    });
}

function validarTexto(valor, limite) {
    return (
        typeof valor === 'string' &&
        valor.trim().length > 0 &&
        valor.trim().length <= limite
    );
}

function normalizarBooleano(valor) {
    if (valor === true || valor === 1 || valor === '1') return 1;
    if (valor === false || valor === 0 || valor === '0') return 0;
    return null;
}

function normalizarId(valor) {
    if (valor === undefined || valor === null || valor === '') {
        return null;
    }

    if (typeof valor !== 'string' || valor.trim() === '') {
        return undefined;
    }

    return valor.trim();
}

function validarPreco(valor) {
    if (
        valor === null ||
        valor === undefined ||
        typeof valor === 'boolean' ||
        (typeof valor === 'string' && valor.trim() === '')
    ) {
        return null;
    }

    const preco = Number(valor);

    if (!Number.isFinite(preco) || preco < 0) {
        return null;
    }

    if (preco > 99999999.99) {
        return null;
    }

    if (Math.round(preco * 100) !== preco * 100) {
        return null;
    }

    return preco;
}

async function validarCategoria(trx, categoriaId, estabelecimentoId) {
    if (categoriaId === null) {
        return true;
    }

    if (
        typeof categoriaId !== 'string' ||
        categoriaId.trim() === ''
    ) {
        return false;
    }

    const categoria = await trx('mv_categorias')
        .where({
            id: categoriaId,
            estabelecimento_id: estabelecimentoId,
        })
        .first();

    return Boolean(categoria);
}

async function validarSubcategoria(
    trx,
    subcategoriaId,
    categoriaId,
    estabelecimentoId
) {
    // A subcategoria é opcional.
    if (subcategoriaId === null) {
        return true;
    }

    // Uma subcategoria obrigatoriamente precisa de uma categoria.
    if (categoriaId === null) {
        return false;
    }

    if (
        typeof subcategoriaId !== 'string' ||
        subcategoriaId.trim() === ''
    ) {
        return false;
    }

    const subcategoria = await trx('mv_subcategorias')
        .where({
            id: subcategoriaId,
            categoria_id: categoriaId,
            estabelecimento_id: estabelecimentoId,
        })
        .first();

    return Boolean(subcategoria);
}

function erroValidacao(message) {
    const erro = new Error(message);
    erro.status = 400;
    return erro;
}

function selecionarCamposProduto(consulta) {
    return consulta.select(
        'p.id',
        'p.estabelecimento_id',
        'p.categoria_id',
        'c.nome as categoria_nome',
        'p.subcategoria_id',
        's.nome as subcategoria_nome',
        'p.nome',
        'p.descricao',
        'p.preco',
        'p.imagem_url',
        'p.ativo',
        'p.destaque',
        'p.ordem',
        'p.created_at',
        'p.updated_at'
    );
}

function montarConsultaProduto() {
    return db('mv_produtos as p')
        .leftJoin('mv_categorias as c', function () {
            this.on('c.id', '=', 'p.categoria_id')
                .andOn(
                    'c.estabelecimento_id',
                    '=',
                    'p.estabelecimento_id'
                );
        })
        .leftJoin('mv_subcategorias as s', function () {
            this.on('s.id', '=', 'p.subcategoria_id')
                .andOn(
                    's.categoria_id',
                    '=',
                    'p.categoria_id'
                )
                .andOn(
                    's.estabelecimento_id',
                    '=',
                    'p.estabelecimento_id'
                );
        });
}

module.exports = {
    // =====================================================
    // LISTAR PRODUTOS DO ESTABELECIMENTO
    // =====================================================
    async listar(request, response) {
        try {
            const consulta = selecionarCamposProduto(
                montarConsultaProduto()
            ).where(
                'p.estabelecimento_id',
                request.estabelecimentoId
            );

            if (
                request.query.ativo === '0' ||
                request.query.ativo === '1'
            ) {
                consulta.where('p.ativo', Number(request.query.ativo));
            }

            if (request.query.categoria_id) {
                consulta.where(
                    'p.categoria_id',
                    request.query.categoria_id
                );
            }

            if (request.query.subcategoria_id) {
                consulta.where(
                    'p.subcategoria_id',
                    request.query.subcategoria_id
                );
            }

            const produtos = await consulta
                .orderBy('p.ordem', 'asc')
                .orderBy('p.nome', 'asc');

            return response.status(200).json({
                status: true,
                dados: produtos,
            });
        } catch (erro) {
            console.error('Erro ao listar produtos:', erro.message);

            return response.status(500).json({
                status: false,
                message: 'Erro ao listar produtos.',
            });
        }
    },

    // =====================================================
    // CONSULTAR PRODUTO
    // =====================================================
    async consultar(request, response) {
        try {
            const produto = await selecionarCamposProduto(
                montarConsultaProduto()
            )
                .where('p.id', request.params.id)
                .andWhere(
                    'p.estabelecimento_id',
                    request.estabelecimentoId
                )
                .first();

            if (!produto) {
                return naoEncontrado(response);
            }

            return response.status(200).json({
                status: true,
                dados: produto,
            });
        } catch (erro) {
            console.error('Erro ao consultar produto:', erro.message);

            return response.status(500).json({
                status: false,
                message: 'Erro ao consultar produto.',
            });
        }
    },

    // =====================================================
    // CADASTRAR PRODUTO
    // =====================================================
    async cadastrar(request, response) {
        try {
            const {
                categoria_id,
                subcategoria_id,
                nome,
                descricao,
                preco,
                imagem_url,
                destaque,
                ordem,
            } = request.body;

            if (!validarTexto(nome, 150)) {
                return response.status(400).json({
                    status: false,
                    message:
                        'Informe o nome do produto (até 150 caracteres).',
                });
            }

            const precoFinal = validarPreco(preco);

            if (precoFinal === null) {
                return response.status(400).json({
                    status: false,
                    message:
                        'Informe um preço não negativo, com no máximo duas casas decimais.',
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

            if (
                imagem_url !== undefined &&
                imagem_url !== null &&
                (
                    typeof imagem_url !== 'string' ||
                    imagem_url.trim().length > 500
                )
            ) {
                return response.status(400).json({
                    status: false,
                    message:
                        'A URL da imagem deve ter até 500 caracteres.',
                });
            }

            const destaqueFinal =
                destaque === undefined
                    ? 0
                    : normalizarBooleano(destaque);

            if (destaqueFinal === null) {
                return response.status(400).json({
                    status: false,
                    message:
                        'O destaque deve ser true, false, 1 ou 0.',
                });
            }

            const ordemFinal = ordem === undefined ? 0 : Number(ordem);

            if (!Number.isInteger(ordemFinal) || ordemFinal < 0) {
                return response.status(400).json({
                    status: false,
                    message:
                        'A ordem deve ser um inteiro não negativo.',
                });
            }

            const categoriaId = normalizarId(categoria_id);
            const subcategoriaId = normalizarId(subcategoria_id);

            if (
                categoriaId === undefined ||
                subcategoriaId === undefined
            ) {
                return response.status(400).json({
                    status: false,
                    message:
                        'Os identificadores da categoria e subcategoria são inválidos.',
                });
            }

            const estabelecimentoId = request.estabelecimentoId;
            const dataAtual = new Date();

            const produto = {
                id: randomUUID(),
                estabelecimento_id: estabelecimentoId,
                categoria_id: categoriaId,
                subcategoria_id: subcategoriaId,
                nome: nome.trim(),
                descricao:
                    typeof descricao === 'string'
                        ? descricao.trim() || null
                        : null,
                preco: precoFinal,
                imagem_url:
                    typeof imagem_url === 'string'
                        ? imagem_url.trim() || null
                        : null,
                ativo: 1,
                destaque: destaqueFinal,
                ordem: ordemFinal,
                created_at: dataAtual,
                updated_at: dataAtual,
            };

            await db.transaction(async (trx) => {
                const categoriaValida = await validarCategoria(
                    trx,
                    categoriaId,
                    estabelecimentoId
                );

                if (!categoriaValida) {
                    throw erroValidacao(
                        'A categoria não pertence ao estabelecimento.'
                    );
                }

                const subcategoriaValida = await validarSubcategoria(
                    trx,
                    subcategoriaId,
                    categoriaId,
                    estabelecimentoId
                );

                if (!subcategoriaValida) {
                    throw erroValidacao(
                        'A subcategoria não pertence ao estabelecimento ou à categoria selecionada.'
                    );
                }

                await trx('mv_produtos').insert(produto);
            });

            return response.status(201).json({
                status: true,
                message: 'Produto cadastrado com sucesso.',
                dados: produto,
            });
        } catch (erro) {
            if (erro.status === 400) {
                return response.status(400).json({
                    status: false,
                    message: erro.message,
                });
            }

            console.error('Erro ao cadastrar produto:', erro.message);

            return response.status(500).json({
                status: false,
                message: 'Erro ao cadastrar produto.',
            });
        }
    },

    // =====================================================
    // ATUALIZAR PRODUTO
    // =====================================================
    async atualizar(request, response) {
        try {
            const {
                categoria_id,
                subcategoria_id,
                nome,
                descricao,
                preco,
                imagem_url,
                destaque,
                ordem,
            } = request.body;

            const estabelecimentoId = request.estabelecimentoId;
            const atualizacao = {};

            if (nome !== undefined) {
                if (!validarTexto(nome, 150)) {
                    return response.status(400).json({
                        status: false,
                        message:
                            'Informe um nome válido de até 150 caracteres.',
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

            if (preco !== undefined) {
                const precoFinal = validarPreco(preco);

                if (precoFinal === null) {
                    return response.status(400).json({
                        status: false,
                        message:
                            'Informe um preço não negativo, com no máximo duas casas decimais.',
                    });
                }

                atualizacao.preco = precoFinal;
            }

            if (imagem_url !== undefined) {
                if (
                    imagem_url !== null &&
                    (
                        typeof imagem_url !== 'string' ||
                        imagem_url.trim().length > 500
                    )
                ) {
                    return response.status(400).json({
                        status: false,
                        message:
                            'A URL da imagem deve ter até 500 caracteres.',
                    });
                }

                atualizacao.imagem_url =
                    typeof imagem_url === 'string'
                        ? imagem_url.trim() || null
                        : null;
            }

            if (destaque !== undefined) {
                const destaqueFinal = normalizarBooleano(destaque);

                if (destaqueFinal === null) {
                    return response.status(400).json({
                        status: false,
                        message:
                            'O destaque deve ser true, false, 1 ou 0.',
                    });
                }

                atualizacao.destaque = destaqueFinal;
            }

            if (ordem !== undefined) {
                const ordemFinal = Number(ordem);

                if (!Number.isInteger(ordemFinal) || ordemFinal < 0) {
                    return response.status(400).json({
                        status: false,
                        message:
                            'A ordem deve ser um inteiro não negativo.',
                    });
                }

                atualizacao.ordem = ordemFinal;
            }

            let categoriaInformada;
            let subcategoriaInformada;

            if (categoria_id !== undefined) {
                categoriaInformada = normalizarId(categoria_id);

                if (categoriaInformada === undefined) {
                    return response.status(400).json({
                        status: false,
                        message: 'O identificador da categoria é inválido.',
                    });
                }
            }

            if (subcategoria_id !== undefined) {
                subcategoriaInformada = normalizarId(subcategoria_id);

                if (subcategoriaInformada === undefined) {
                    return response.status(400).json({
                        status: false,
                        message:
                            'O identificador da subcategoria é inválido.',
                    });
                }
            }

            if (Object.keys(atualizacao).length === 0 &&
                categoria_id === undefined &&
                subcategoria_id === undefined) {
                return response.status(400).json({
                    status: false,
                    message:
                        'Informe ao menos um campo para atualizar.',
                });
            }

            await db.transaction(async (trx) => {
                const produto = await trx('mv_produtos')
                    .where({
                        id: request.params.id,
                        estabelecimento_id: estabelecimentoId,
                    })
                    .first();

                if (!produto) {
                    throw erroValidacao('PRODUTO_NAO_ENCONTRADO');
                }

                // Determina os relacionamentos finais do produto.
                // Se um campo não for enviado, preserva o valor atual.
                const categoriaFinal =
                    categoria_id !== undefined
                        ? categoriaInformada
                        : produto.categoria_id;

                let subcategoriaFinal =
                    subcategoria_id !== undefined
                        ? subcategoriaInformada
                        : produto.subcategoria_id;

                // Se a categoria mudar sem envio explícito da
                // subcategoria, não mantém uma subcategoria antiga
                // que possa pertencer à categoria anterior.
                if (
                    categoria_id !== undefined &&
                    subcategoria_id === undefined &&
                    categoriaFinal !== produto.categoria_id
                ) {
                    subcategoriaFinal = null;
                }

                const categoriaValida = await validarCategoria(
                    trx,
                    categoriaFinal,
                    estabelecimentoId
                );

                if (!categoriaValida) {
                    throw erroValidacao(
                        'A categoria não pertence ao estabelecimento.'
                    );
                }

                const subcategoriaValida = await validarSubcategoria(
                    trx,
                    subcategoriaFinal,
                    categoriaFinal,
                    estabelecimentoId
                );

                if (!subcategoriaValida) {
                    throw erroValidacao(
                        'A subcategoria não pertence ao estabelecimento ou à categoria selecionada.'
                    );
                }

                if (categoria_id !== undefined) {
                    atualizacao.categoria_id = categoriaFinal;
                }

                if (
                    subcategoria_id !== undefined ||
                    (
                        categoria_id !== undefined &&
                        categoriaFinal !== produto.categoria_id
                    )
                ) {
                    atualizacao.subcategoria_id = subcategoriaFinal;
                }

                atualizacao.updated_at = new Date();

                await trx('mv_produtos')
                    .where({
                        id: request.params.id,
                        estabelecimento_id: estabelecimentoId,
                    })
                    .update(atualizacao);
            });

            const produtoAtualizado = await selecionarCamposProduto(
                montarConsultaProduto()
            )
                .where('p.id', request.params.id)
                .andWhere(
                    'p.estabelecimento_id',
                    estabelecimentoId
                )
                .first();

            return response.status(200).json({
                status: true,
                message: 'Produto atualizado com sucesso.',
                dados: produtoAtualizado,
            });
        } catch (erro) {
            if (erro.message === 'PRODUTO_NAO_ENCONTRADO') {
                return naoEncontrado(response);
            }

            if (erro.status === 400) {
                return response.status(400).json({
                    status: false,
                    message: erro.message,
                });
            }

            console.error('Erro ao atualizar produto:', erro.message);

            return response.status(500).json({
                status: false,
                message: 'Erro ao atualizar produto.',
            });
        }
    },

    // =====================================================
    // ATIVAR OU DESATIVAR PRODUTO
    // =====================================================
    async alterarStatus(request, response) {
        try {
            const ativo = normalizarBooleano(request.body.ativo);

            if (ativo === null) {
                return response.status(400).json({
                    status: false,
                    message: 'Informe ativo como true, false, 1 ou 0.',
                });
            }

            const estabelecimentoId = request.estabelecimentoId;

            const produto = await db('mv_produtos')
                .where({
                    id: request.params.id,
                    estabelecimento_id: estabelecimentoId,
                })
                .first();

            if (!produto) {
                return naoEncontrado(response);
            }

            await db('mv_produtos')
                .where({
                    id: request.params.id,
                    estabelecimento_id: estabelecimentoId,
                })
                .update({
                    ativo,
                    updated_at: new Date(),
                });

            return response.status(200).json({
                status: true,
                message: ativo
                    ? 'Produto ativado com sucesso.'
                    : 'Produto desativado com sucesso.',
            });
        } catch (erro) {
            console.error(
                'Erro ao alterar status do produto:',
                erro.message
            );

            return response.status(500).json({
                status: false,
                message: 'Erro ao alterar status do produto.',
            });
        }
    },
};
