
require('dotenv/config');

const db = require('../connection');

const tabelasMenuVivo = [
    'mv_estabelecimentos',
    'mv_usuarios',
    'mv_categorias',
    'mv_produtos',
    'mv_midias',
    'mv_mesas',
    'mv_pedidos',
    'mv_itens_pedido',
    'mv_historico_pedidos',
];

async function criarTabelasMenuVivo() {
    const criadas = [];

    try {
        // Proteção: utilizar somente o banco de desenvolvimento autorizado.
        if (process.env.DATABASE_NAME !== 'innvento') {
            throw new Error(
                `Banco inesperado: ${process.env.DATABASE_NAME}. ` +
                'Criação cancelada.'
            );
        }

        // Conferir todos os nomes antes de criar qualquer tabela.
        const existentes = [];

        for (const nome of tabelasMenuVivo) {
            if (await db.schema.hasTable(nome)) {
                existentes.push(nome);
            }
        }

        if (existentes.length > 0) {
            throw new Error(
                'Criação cancelada. Estas tabelas já existem: ' +
                existentes.join(', ')
            );
        }

        console.log('Banco confirmado: innvento');
        console.log('Nenhuma das tabelas mv_* já existe.');
        console.log('Iniciando criação das tabelas...\n');

        // =====================================================
        // 1. ESTABELECIMENTOS
        // =====================================================
        await db.schema.createTable('mv_estabelecimentos', (table) => {
            table.string('id', 36).primary();
            table.string('nome', 150).notNullable();
            table.string('slug', 180).notNullable().unique();
            table.string('cnpj', 20).nullable();
            table.string('telefone', 30).nullable();
            table.string('email', 150).nullable();
            table.string('endereco', 255).nullable();
            table.string('logo_url', 500).nullable();
            table.string('status', 20).notNullable().defaultTo('ATIVO');
            table.dateTime('created_at').notNullable().defaultTo(db.fn.now());
            table.dateTime('updated_at').notNullable().defaultTo(db.fn.now());
        });
        criadas.push('mv_estabelecimentos');

        // =====================================================
        // 2. USUÁRIOS
        // =====================================================
        await db.schema.createTable('mv_usuarios', (table) => {
            table.string('id', 36).primary();

            table.string('estabelecimento_id', 36).nullable();
            table.string('nome', 150).notNullable();
            table.string('email', 180).notNullable().unique();
            table.string('senha', 255).notNullable();

            // ADMIN, PROPRIETARIO ou FUNCIONARIO.
            table.string('perfil', 30).notNullable().defaultTo('FUNCIONARIO');
            table.string('status', 20).notNullable().defaultTo('ATIVO');

            table.dateTime('ultimo_acesso').nullable();
            table.dateTime('created_at').notNullable().defaultTo(db.fn.now());
            table.dateTime('updated_at').notNullable().defaultTo(db.fn.now());

            table.foreign('estabelecimento_id')
                .references('id')
                .inTable('mv_estabelecimentos')
                .onDelete('RESTRICT')
                .onUpdate('CASCADE');

            table.index(
                ['estabelecimento_id'],
                'mv_idx_usuarios_estabelecimento'
            );
        });
        criadas.push('mv_usuarios');

        // =====================================================
        // 3. CATEGORIAS
        // =====================================================
        await db.schema.createTable('mv_categorias', (table) => {
            table.string('id', 36).primary();
            table.string('estabelecimento_id', 36).notNullable();
            table.string('nome', 100).notNullable();
            table.text('descricao').nullable();
            table.integer('ordem').notNullable().defaultTo(0);
            table.boolean('ativo').notNullable().defaultTo(true);
            table.dateTime('created_at').notNullable().defaultTo(db.fn.now());
            table.dateTime('updated_at').notNullable().defaultTo(db.fn.now());

            table.foreign('estabelecimento_id')
                .references('id')
                .inTable('mv_estabelecimentos')
                .onDelete('RESTRICT')
                .onUpdate('CASCADE');

            table.index(
                ['estabelecimento_id', 'ativo'],
                'mv_idx_categorias_estab_ativo'
            );
        });
        criadas.push('mv_categorias');

        // =====================================================
        // 4. PRODUTOS
        // =====================================================
        await db.schema.createTable('mv_produtos', (table) => {
            table.string('id', 36).primary();
            table.string('estabelecimento_id', 36).notNullable();
            table.string('categoria_id', 36).nullable();

            table.string('nome', 150).notNullable();
            table.text('descricao').nullable();
            table.decimal('preco', 12, 2).notNullable();
            table.string('imagem_url', 500).nullable();

            table.boolean('ativo').notNullable().defaultTo(true);
            table.boolean('destaque').notNullable().defaultTo(false);
            table.integer('ordem').notNullable().defaultTo(0);

            table.dateTime('created_at').notNullable().defaultTo(db.fn.now());
            table.dateTime('updated_at').notNullable().defaultTo(db.fn.now());

            table.foreign('estabelecimento_id')
                .references('id')
                .inTable('mv_estabelecimentos')
                .onDelete('RESTRICT')
                .onUpdate('CASCADE');

            table.foreign('categoria_id')
                .references('id')
                .inTable('mv_categorias')
                .onDelete('RESTRICT')
                .onUpdate('CASCADE');

            table.index(
                ['estabelecimento_id', 'ativo'],
                'mv_idx_produtos_estab_ativo'
            );

            table.index(
                ['categoria_id'],
                'mv_idx_produtos_categoria'
            );
        });
        criadas.push('mv_produtos');

        // =====================================================
        // 5. MÍDIAS
        // =====================================================
        await db.schema.createTable('mv_midias', (table) => {
            table.string('id', 36).primary();
            table.string('estabelecimento_id', 36).notNullable();
            table.string('produto_id', 36).nullable();

            table.string('tipo', 20).notNullable().defaultTo('IMAGEM');
            table.string('url', 500).notNullable();
            table.string('texto_alternativo', 255).nullable();
            table.integer('ordem').notNullable().defaultTo(0);

            table.dateTime('created_at').notNullable().defaultTo(db.fn.now());

            table.foreign('estabelecimento_id')
                .references('id')
                .inTable('mv_estabelecimentos')
                .onDelete('RESTRICT')
                .onUpdate('CASCADE');

            table.foreign('produto_id')
                .references('id')
                .inTable('mv_produtos')
                .onDelete('RESTRICT')
                .onUpdate('CASCADE');

            table.index(
                ['estabelecimento_id'],
                'mv_idx_midias_estabelecimento'
            );

            table.index(
                ['produto_id'],
                'mv_idx_midias_produto'
            );
        });
        criadas.push('mv_midias');

        // =====================================================
        // 6. MESAS
        // =====================================================
        await db.schema.createTable('mv_mesas', (table) => {
            table.string('id', 36).primary();
            table.string('estabelecimento_id', 36).notNullable();

            table.string('numero', 30).notNullable();
            table.string('codigo_qr', 100).notNullable().unique();
            table.string('status', 20).notNullable().defaultTo('ATIVA');

            table.dateTime('created_at').notNullable().defaultTo(db.fn.now());
            table.dateTime('updated_at').notNullable().defaultTo(db.fn.now());

            table.foreign('estabelecimento_id')
                .references('id')
                .inTable('mv_estabelecimentos')
                .onDelete('RESTRICT')
                .onUpdate('CASCADE');

            table.unique(
                ['estabelecimento_id', 'numero'],
                'mv_unq_mesas_estab_numero'
            );

            table.index(
                ['estabelecimento_id', 'status'],
                'mv_idx_mesas_estab_status'
            );
        });
        criadas.push('mv_mesas');

        // =====================================================
        // 7. PEDIDOS
        // =====================================================
        await db.schema.createTable('mv_pedidos', (table) => {
            table.string('id', 36).primary();
            table.string('estabelecimento_id', 36).notNullable();
            table.string('mesa_id', 36).nullable();

            table.string('codigo', 40).notNullable();
            table.string('cliente_nome', 150).nullable();
            table.string('origem', 30).notNullable().defaultTo('MESA');
            table.string('status', 30).notNullable().defaultTo('NOVO');

            table.decimal('subtotal', 12, 2).notNullable().defaultTo(0);
            table.decimal('taxa_servico', 12, 2).notNullable().defaultTo(0);
            table.decimal('desconto', 12, 2).notNullable().defaultTo(0);
            table.decimal('total', 12, 2).notNullable().defaultTo(0);

            table.text('observacao').nullable();

            table.dateTime('created_at').notNullable().defaultTo(db.fn.now());
            table.dateTime('updated_at').notNullable().defaultTo(db.fn.now());

            table.foreign('estabelecimento_id')
                .references('id')
                .inTable('mv_estabelecimentos')
                .onDelete('RESTRICT')
                .onUpdate('CASCADE');

            table.foreign('mesa_id')
                .references('id')
                .inTable('mv_mesas')
                .onDelete('RESTRICT')
                .onUpdate('CASCADE');

            table.unique(
                ['estabelecimento_id', 'codigo'],
                'mv_unq_pedidos_estab_codigo'
            );

            table.index(
                ['estabelecimento_id', 'status'],
                'mv_idx_pedidos_estab_status'
            );

            table.index(
                ['created_at'],
                'mv_idx_pedidos_created_at'
            );
        });
        criadas.push('mv_pedidos');

        // =====================================================
        // 8. ITENS DO PEDIDO
        // =====================================================
        await db.schema.createTable('mv_itens_pedido', (table) => {
            table.string('id', 36).primary();
            table.string('pedido_id', 36).notNullable();
            table.string('produto_id', 36).nullable();

            // Cópia dos dados comerciais no momento da compra.
            table.string('produto_nome', 150).notNullable();
            table.decimal('preco_unitario', 12, 2).notNullable();
            table.integer('quantidade').unsigned().notNullable();
            table.decimal('subtotal', 12, 2).notNullable();

            table.text('observacao').nullable();
            table.dateTime('created_at').notNullable().defaultTo(db.fn.now());

            table.foreign('pedido_id')
                .references('id')
                .inTable('mv_pedidos')
                .onDelete('RESTRICT')
                .onUpdate('CASCADE');

            table.foreign('produto_id')
                .references('id')
                .inTable('mv_produtos')
                .onDelete('RESTRICT')
                .onUpdate('CASCADE');

            table.index(
                ['pedido_id'],
                'mv_idx_itens_pedido_pedido'
            );

            table.index(
                ['produto_id'],
                'mv_idx_itens_pedido_produto'
            );
        });
        criadas.push('mv_itens_pedido');

        // =====================================================
        // 9. HISTÓRICO DOS PEDIDOS
        // =====================================================
        await db.schema.createTable('mv_historico_pedidos', (table) => {
            table.string('id', 36).primary();
            table.string('pedido_id', 36).notNullable();
            table.string('usuario_id', 36).nullable();

            table.string('status_anterior', 30).nullable();
            table.string('status_novo', 30).notNullable();
            table.text('descricao').nullable();

            table.dateTime('created_at').notNullable().defaultTo(db.fn.now());

            table.foreign('pedido_id')
                .references('id')
                .inTable('mv_pedidos')
                .onDelete('RESTRICT')
                .onUpdate('CASCADE');

            table.foreign('usuario_id')
                .references('id')
                .inTable('mv_usuarios')
                .onDelete('RESTRICT')
                .onUpdate('CASCADE');

            table.index(
                ['pedido_id', 'created_at'],
                'mv_idx_historico_pedido_data'
            );
        });
        criadas.push('mv_historico_pedidos');

        console.log('\nTabelas criadas com sucesso:');
        console.table(criadas.map((tabela) => ({ tabela })));
        console.log('Nenhuma tabela preexistente foi alterada.');

    } catch (erro) {
        console.error('\nErro na criação:', erro.message);

        if (criadas.length > 0) {
            console.error(
                'Tabelas que já foram criadas antes da falha:',
                criadas.join(', ')
            );
            console.error(
                'Não execute novamente sem verificar quais tabelas existem.'
            );
        }

        process.exitCode = 1;
    } finally {
        await db.destroy();
    }
}

criarTabelasMenuVivo();
