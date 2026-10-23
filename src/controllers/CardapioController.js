const db = require('../database/connection');

module.exports = {
    async consultar(request, response) {
        try {
            const { slug } = request.params;

            if (
                typeof slug !== 'string' ||
                !slug.trim()
            ) {
                return response.status(400).json({
                    status: false,
                    message: 'Informe o endereço do cardápio.',
                });
            }

            // =====================================================
            // ESTABELECIMENTO
            // =====================================================

            const estabelecimento = await db('mv_estabelecimentos')
                .select(
                    'id',
                    'nome',
                    'slug',
                    'telefone',
                    'endereco',
                    'logo_url'
                )
                .where('slug', slug.trim())
                .where('status', 'ATIVO')
                .first();

            if (!estabelecimento) {
                return response.status(404).json({
                    status: false,
                    message: 'Cardápio não encontrado ou indisponível.',
                });
            }

            // =====================================================
            // VALIDAR MESA PELO QR CODE, QUANDO INFORMADO
            // =====================================================

            const codigoMesaInformado = request.query.mesa;

            let mesaSelecionada = null;

            if (codigoMesaInformado !== undefined) {
                if (
                    typeof codigoMesaInformado !== 'string' ||
                    !codigoMesaInformado.trim()
                ) {
                    return response.status(400).json({
                        status: false,
                        message: 'O código da mesa é inválido.',
                    });
                }

                mesaSelecionada = await db('mv_mesas')
                    .select('id', 'numero', 'status')
                    .where(
                        'estabelecimento_id',
                        estabelecimento.id
                    )
                    .where(
                        'codigo_qr',
                        codigoMesaInformado.trim()
                    )
                    .where('status', 'ATIVA')
                    .first();

                if (!mesaSelecionada) {
                    return response.status(404).json({
                        status: false,
                        message: 'Mesa não encontrada ou indisponível.',
                    });
                }
            }

            const estabelecimentoId = estabelecimento.id;

            // =====================================================
            // CATEGORIAS ATIVAS
            // =====================================================

            const categorias = await db('mv_categorias')
                .select(
                    'id',
                    'nome',
                    'descricao',
                    'ordem'
                )
                .where('estabelecimento_id', estabelecimentoId)
                .where('ativo', 1)
                .orderBy('ordem', 'asc')
                .orderBy('nome', 'asc');

            const categoriasIds = categorias.map(
                categoria => categoria.id
            );

            // =====================================================
            // SUBCATEGORIAS ATIVAS
            // =====================================================

            let subcategorias = [];

            if (categoriasIds.length > 0) {
                subcategorias = await db('mv_subcategorias as s')
                    .join('mv_categorias as c', function () {
                        this.on('c.id', '=', 's.categoria_id')
                            .andOn(
                                'c.estabelecimento_id',
                                '=',
                                's.estabelecimento_id'
                            );
                    })
                    .select(
                        's.id',
                        's.categoria_id',
                        's.nome',
                        's.descricao',
                        's.ordem'
                    )
                    .where(
                        's.estabelecimento_id',
                        estabelecimentoId
                    )
                    .where('s.ativo', 1)
                    .where('c.ativo', 1)
                    .whereIn('s.categoria_id', categoriasIds)
                    .orderBy('s.ordem', 'asc')
                    .orderBy('s.nome', 'asc');
            }

            // =====================================================
            // PRODUTOS ATIVOS
            // =====================================================

            const produtos = await db('mv_produtos')
                .select(
                    'id',
                    'categoria_id',
                    'subcategoria_id',
                    'nome',
                    'descricao',
                    'preco',
                    'imagem_url',
                    'destaque',
                    'ordem'
                )
                .where('estabelecimento_id', estabelecimentoId)
                .where('ativo', 1)
                .orderBy('ordem', 'asc')
                .orderBy('nome', 'asc');

            // =====================================================
            // ÍNDICES PARA ORGANIZAÇÃO DOS DADOS
            // =====================================================

            const categoriasAtivasIds = new Set(
                categorias.map(categoria => categoria.id)
            );

            const subcategoriasPorCategoria = new Map();
            const subcategoriasAtivasIds = new Set();

            subcategorias.forEach(subcategoria => {
                subcategoriasAtivasIds.add(subcategoria.id);

                if (
                    !subcategoriasPorCategoria.has(
                        subcategoria.categoria_id
                    )
                ) {
                    subcategoriasPorCategoria.set(
                        subcategoria.categoria_id,
                        []
                    );
                }

                subcategoriasPorCategoria
                    .get(subcategoria.categoria_id)
                    .push({
                        ...subcategoria,
                        produtos: [],
                    });
            });

            const subcategoriaPorId = new Map();

            subcategoriasPorCategoria.forEach(
                listaSubcategorias => {
                    listaSubcategorias.forEach(subcategoria => {
                        subcategoriaPorId.set(
                            subcategoria.id,
                            subcategoria
                        );
                    });
                }
            );

            const categoriasPorId = new Map();

            const categoriasComProdutos = categorias.map(
                categoria => {
                    const categoriaFormatada = {
                        ...categoria,
                        subcategorias:
                            subcategoriasPorCategoria.get(
                                categoria.id
                            ) || [],
                        produtos: [],
                    };

                    categoriasPorId.set(
                        categoria.id,
                        categoriaFormatada
                    );

                    return categoriaFormatada;
                }
            );

            // =====================================================
            // DISTRIBUIR PRODUTOS
            // =====================================================

            const produtosSemCategoria = [];

            produtos.forEach(produto => {
                // Produtos sem categoria são listados separadamente.
                if (produto.categoria_id === null) {
                    // Não associa um produto sem categoria a uma
                    // subcategoria, mesmo que haja dados inconsistentes.
                    produtosSemCategoria.push(produto);
                    return;
                }

                // Não exibe produtos de categorias inativas,
                // inexistentes ou pertencentes a outro estabelecimento.
                if (!categoriasAtivasIds.has(produto.categoria_id)) {
                    return;
                }

                const categoria = categoriasPorId.get(
                    produto.categoria_id
                );

                if (!categoria) {
                    return;
                }

                // Produtos com subcategoria só aparecem se ela estiver
                // ativa e pertencer à categoria do próprio produto.
                if (produto.subcategoria_id !== null) {
                    if (
                        !subcategoriasAtivasIds.has(
                            produto.subcategoria_id
                        )
                    ) {
                        return;
                    }

                    const subcategoria = subcategoriaPorId.get(
                        produto.subcategoria_id
                    );

                    if (
                        !subcategoria ||
                        subcategoria.categoria_id !==
                            produto.categoria_id
                    ) {
                        return;
                    }

                    subcategoria.produtos.push(produto);
                    return;
                }

                // Mantém os produtos sem subcategoria diretamente
                // dentro da categoria.
                categoria.produtos.push(produto);
            });

            return response.status(200).json({
                status: true,
                dados: {
                    estabelecimento,
                    mesa: mesaSelecionada
                        ? {
                            id: mesaSelecionada.id,
                            numero: mesaSelecionada.numero,
                        }
                        : null,
                    categorias: categoriasComProdutos,
                    produtos_sem_categoria: produtosSemCategoria,
                },
            });            
        } catch (error) {
            console.error(
                'Erro ao consultar cardápio público:',
                error
            );

            return response.status(500).json({
                status: false,
                message: 'Não foi possível carregar o cardápio.',
            });
        }
    },
};

