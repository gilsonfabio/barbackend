
const crypto = require('crypto');
const connection = require('../database/connection');

function respostaErro(response, statusCode, message) {
    return response.status(statusCode).json({
        status: 'erro',
        message,
    });
}

function gerarCodigoPedido() {
    // Código legível, com baixa probabilidade de colisão.
    return `MV${Date.now().toString().slice(-8)}${crypto
        .randomBytes(2)
        .toString('hex')
        .toUpperCase()}`;
}

module.exports = {
    async criarPublico(request, response) {
        const { slug } = request.params;

        const {
            mesa_id,
            cliente_nome,
            observacao,
            itens,
        } = request.body || {};

        if (!Array.isArray(itens) || itens.length === 0) {
            return respostaErro(
                response,
                400,
                'Adicione pelo menos um produto ao pedido.'
            );
        }

        if (itens.length > 50) {
            return respostaErro(
                response,
                400,
                'O pedido ultrapassa o limite de 50 produtos diferentes.'
            );
        }

        if (
            cliente_nome != null &&
            (typeof cliente_nome !== 'string' || cliente_nome.length > 120)
        ) {
            return respostaErro(
                response,
                400,
                'O nome do cliente deve ter no máximo 120 caracteres.'
            );
        }

        if (
            observacao != null &&
            (typeof observacao !== 'string' || observacao.length > 1000)
        ) {
            return respostaErro(
                response,
                400,
                'A observação deve ter no máximo 1000 caracteres.'
            );
        }

        // Combina produtos repetidos e valida quantidades.
        const quantidadesPorProduto = new Map();
        const observacoesPorProduto = new Map();

        for (const item of itens) {
            if (
                !item ||
                typeof item.produto_id !== 'string' ||
                item.produto_id.trim() === ''
            ) {
                return respostaErro(
                    response,
                    400,
                    'Foi informado um produto inválido.'
                );
            }

            const quantidade = Number(item.quantidade);

            if (
                !Number.isInteger(quantidade) ||
                quantidade < 1 ||
                quantidade > 99
            ) {
                return respostaErro(
                    response,
                    400,
                    'A quantidade de cada produto deve ser um número inteiro entre 1 e 99.'
                );
            }

            if (
                item.observacao != null &&
                (
                    typeof item.observacao !== 'string' ||
                    item.observacao.length > 500
                )
            ) {
                return respostaErro(
                    response,
                    400,
                    'A observação de cada item deve ter no máximo 500 caracteres.'
                );
            }

            const produtoId = item.produto_id.trim();

            quantidadesPorProduto.set(
                produtoId,
                (quantidadesPorProduto.get(produtoId) || 0) + quantidade
            );

            // A interface envia uma linha por produto.
            observacoesPorProduto.set(
                produtoId,
                item.observacao ? item.observacao.trim() : null
            );

            if (quantidadesPorProduto.get(produtoId) > 99) {
                return respostaErro(
                    response,
                    400,
                    'A quantidade total de cada produto não pode ultrapassar 99.'
                );
            }
        }

        const produtoIds = [...quantidadesPorProduto.keys()];

        try {
            // Confirma que o estabelecimento existe e está ativo.
            const estabelecimento = await connection('mv_estabelecimentos')
                .where({ slug, status: 'ATIVO' })
                .first();

            if (!estabelecimento) {
                return respostaErro(
                    response,
                    404,
                    'Estabelecimento não encontrado ou inativo.'
                );
            }

            // A mesa é opcional no cardápio, mas, quando informada,
            // precisa pertencer ao estabelecimento e estar ativa.
            if (mesa_id != null) {
                if (typeof mesa_id !== 'string' || !mesa_id.trim()) {
                    return respostaErro(
                        response,
                        400,
                        'Mesa inválida.'
                    );
                }

                const mesa = await connection('mv_mesas')
                    .where({
                        id: mesa_id,
                        estabelecimento_id: estabelecimento.id,
                        status: 'ATIVA',
                    })
                    .first();

                if (!mesa) {
                    return respostaErro(
                        response,
                        400,
                        'A mesa informada não existe, não pertence a este estabelecimento ou está inativa.'
                    );
                }
            }

            // Os preços enviados pelo navegador são ignorados.
            // Usamos exclusivamente os preços registrados no banco.
            const produtos = await connection('mv_produtos')
                .whereIn('id', produtoIds)
                .andWhere({
                    estabelecimento_id: estabelecimento.id,
                    ativo: 1,
                })
                .select('id', 'nome', 'preco');

            if (produtos.length !== produtoIds.length) {
                return respostaErro(
                    response,
                    400,
                    'Um ou mais produtos não estão disponíveis. Atualize o cardápio e tente novamente.'
                );
            }

            const produtosPorId = new Map(
                produtos.map((produto) => [produto.id, produto])
            );

            let subtotalCentavos = 0;

            const itensParaSalvar = produtoIds.map((produtoId) => {
                const produto = produtosPorId.get(produtoId);
                const quantidade = quantidadesPorProduto.get(produtoId);

                // Evita cálculos monetários com ponto flutuante.
                const precoCentavos = Math.round(
                    Number(produto.preco) * 100
                );

                if (
                    !Number.isSafeInteger(precoCentavos) ||
                    precoCentavos < 0
                ) {
                    throw new Error(
                        `Preço inválido para o produto ${produto.nome}.`
                    );
                }

                const totalItemCentavos = precoCentavos * quantidade;

                if (!Number.isSafeInteger(totalItemCentavos)) {
                    throw new Error('O valor de um item é inválido.');
                }

                subtotalCentavos += totalItemCentavos;

                return {
                    produto_id: produto.id,
                    produto_nome: produto.nome,
                    preco_unitario: (precoCentavos / 100).toFixed(2),
                    quantidade,
                    subtotal: (totalItemCentavos / 100).toFixed(2),
                    observacao: observacoesPorProduto.get(produtoId),
                };
            });

            if (!Number.isSafeInteger(subtotalCentavos)) {
                return respostaErro(
                    response,
                    400,
                    'O valor total do pedido é inválido.'
                );
            }

            const subtotal = (subtotalCentavos / 100).toFixed(2);

            // Pedido e itens são salvos juntos: se algo falhar,
            // a transação inteira será revertida.
            const pedidoCriado = await connection.transaction(
                async (trx) => {
                    const pedidoId = crypto.randomUUID();

                    const pedido = {
                        id: pedidoId,
                        estabelecimento_id: estabelecimento.id,
                        mesa_id: mesa_id || null,
                        codigo: gerarCodigoPedido(),
                        cliente_nome: cliente_nome
                            ? cliente_nome.trim()
                            : null,
                        origem: 'MESA',
                        status: 'NOVO',
                        subtotal,
                        taxa_servico: '0.00',
                        desconto: '0.00',
                        total: subtotal,
                        observacao: observacao
                            ? observacao.trim()
                            : null,
                    };

                    await trx('mv_pedidos').insert(pedido);

                    await trx('mv_itens_pedido').insert(
                        itensParaSalvar.map((item) => ({
                            id: crypto.randomUUID(),
                            pedido_id: pedidoId,
                            produto_id: item.produto_id,
                            produto_nome: item.produto_nome,
                            preco_unitario: item.preco_unitario,
                            quantidade: item.quantidade,
                            subtotal: item.subtotal,
                            observacao: item.observacao,
                        }))
                    );

                    return {
                        id: pedidoId,
                        codigo: pedido.codigo,
                        status: pedido.status,
                        subtotal: pedido.subtotal,
                        total: pedido.total,
                    };
                }
            );

            return response.status(201).json({
                status: 'sucesso',
                message: 'Pedido enviado para confirmação do garçom.',
                dados: pedidoCriado,
            });
        } catch (error) {
            console.error(
                'Erro ao criar pedido público do MenuVivo:',
                error
            );

            return respostaErro(
                response,
                500,
                'Não foi possível registrar o pedido. Tente novamente.'
            );
        }
    },
};
