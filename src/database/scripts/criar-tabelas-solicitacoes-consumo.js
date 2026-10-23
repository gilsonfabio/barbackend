
const connection = require('../connection');

async function criarTabelas() {
    try {
        const solicitacoesExiste =
            await connection.schema.hasTable('mv_solicitacoes_consumo');

        if (!solicitacoesExiste) {
            await connection.schema.createTable(
                'mv_solicitacoes_consumo',
                (table) => {
                    table.string('id', 36).primary();
                    table.string('estabelecimento_id', 36).notNullable();
                    table.string('mesa_id', 36).notNullable();
                    table.string('cliente_nome', 150).nullable();
                    table.text('observacao').nullable();

                    table.string('status', 20)
                        .notNullable()
                        .defaultTo('PENDENTE');

                    table.string('confirmado_por', 36).nullable();
                    table.timestamp('confirmado_em').nullable();

                    table.string('rejeitado_por', 36).nullable();
                    table.timestamp('rejeitado_em').nullable();

                    table.timestamp('created_at')
                        .notNullable()
                        .defaultTo(connection.fn.now());

                    table.timestamp('updated_at')
                        .notNullable()
                        .defaultTo(connection.fn.now());

                    table.index(
                        ['estabelecimento_id', 'status'],
                        'idx_mv_solicitacao_est_status'
                    );

                    table.index(
                        ['mesa_id', 'status'],
                        'idx_mv_solicitacao_mesa_status'
                    );
                }
            );

            console.log('Tabela mv_solicitacoes_consumo criada.');
        } else {
            console.log(
                'Tabela mv_solicitacoes_consumo já existe; preservada.'
            );
        }

        const itensExistem =
            await connection.schema.hasTable(
                'mv_itens_solicitacao_consumo'
            );

        if (!itensExistem) {
            await connection.schema.createTable(
                'mv_itens_solicitacao_consumo',
                (table) => {
                    table.string('id', 36).primary();

                    table.string('solicitacao_id', 36).notNullable();
                    table.string('produto_id', 36).notNullable();
                    table.string('produto_nome', 255).notNullable();

                    table.decimal('preco_unitario', 12, 2).notNullable();
                    table.integer('quantidade').unsigned().notNullable();
                    table.decimal('subtotal', 12, 2).notNullable();

                    table.string('observacao', 500).nullable();

                    table.timestamp('created_at')
                        .notNullable()
                        .defaultTo(connection.fn.now());

                    table.timestamp('updated_at')
                        .notNullable()
                        .defaultTo(connection.fn.now());

                    table.index(
                        ['solicitacao_id'],
                        'idx_mv_item_solicitacao'
                    );
                }
            );

            console.log(
                'Tabela mv_itens_solicitacao_consumo criada.'
            );
        } else {
            console.log(
                'Tabela mv_itens_solicitacao_consumo já existe; preservada.'
            );
        }

        console.log('Verificação das tabelas concluída.');
    } catch (error) {
        console.error(
            'Erro ao criar tabelas de solicitações:',
            error.message
        );

        process.exitCode = 1;
    } finally {
        await connection.destroy();
    }
}

criarTabelas();
