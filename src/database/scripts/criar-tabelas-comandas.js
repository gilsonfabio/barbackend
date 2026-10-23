
const connection = require('../connection');

const tabelas = [
    {
        nome: 'mv_comandas',
        sql: `
            CREATE TABLE IF NOT EXISTS mv_comandas (
                id VARCHAR(36) NOT NULL,
                estabelecimento_id VARCHAR(36) NOT NULL,
                mesa_id VARCHAR(36) DEFAULT NULL,
                codigo VARCHAR(40) NOT NULL,
                tipo VARCHAR(20) NOT NULL DEFAULT 'BALCAO',
                cliente_nome VARCHAR(150) DEFAULT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'ABERTA',
                subtotal DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                taxa_servico DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                desconto DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                observacao TEXT DEFAULT NULL,
                aberta_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                fechada_em DATETIME DEFAULT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

                PRIMARY KEY (id),

                UNIQUE KEY mv_unq_comandas_estab_codigo
                    (estabelecimento_id, codigo),

                KEY mv_idx_comandas_estab_status
                    (estabelecimento_id, status),

                KEY mv_idx_comandas_mesa
                    (mesa_id),

                CONSTRAINT mv_comandas_estabelecimento_fk
                    FOREIGN KEY (estabelecimento_id)
                    REFERENCES mv_estabelecimentos (id)
                    ON UPDATE CASCADE,

                CONSTRAINT mv_comandas_mesa_fk
                    FOREIGN KEY (mesa_id)
                    REFERENCES mv_mesas (id)
                    ON UPDATE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `
    },
    {
        nome: 'mv_itens_comanda',
        sql: `
            CREATE TABLE IF NOT EXISTS mv_itens_comanda (
                id VARCHAR(36) NOT NULL,
                comanda_id VARCHAR(36) NOT NULL,
                produto_id VARCHAR(36) DEFAULT NULL,
                produto_nome VARCHAR(150) NOT NULL,
                preco_unitario DECIMAL(12,2) NOT NULL,
                quantidade INT UNSIGNED NOT NULL,
                subtotal DECIMAL(12,2) NOT NULL,
                observacao TEXT DEFAULT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'ATIVO',
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

                PRIMARY KEY (id),

                KEY mv_idx_itens_comanda_comanda
                    (comanda_id),

                KEY mv_idx_itens_comanda_produto
                    (produto_id),

                CONSTRAINT mv_itens_comanda_comanda_fk
                    FOREIGN KEY (comanda_id)
                    REFERENCES mv_comandas (id)
                    ON UPDATE CASCADE,

                CONSTRAINT mv_itens_comanda_produto_fk
                    FOREIGN KEY (produto_id)
                    REFERENCES mv_produtos (id)
                    ON UPDATE CASCADE
                    ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `
    },
    {
        nome: 'mv_pagamentos',
        sql: `
            CREATE TABLE IF NOT EXISTS mv_pagamentos (
                id VARCHAR(36) NOT NULL,
                comanda_id VARCHAR(36) NOT NULL,
                valor DECIMAL(12,2) NOT NULL,
                forma_pagamento VARCHAR(30) NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'CONFIRMADO',
                observacao TEXT DEFAULT NULL,
                registrado_por VARCHAR(36) DEFAULT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

                PRIMARY KEY (id),

                KEY mv_idx_pagamentos_comanda
                    (comanda_id),

                KEY mv_idx_pagamentos_status
                    (status),

                CONSTRAINT mv_pagamentos_comanda_fk
                    FOREIGN KEY (comanda_id)
                    REFERENCES mv_comandas (id)
                    ON UPDATE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `
    }
];

async function criarTabelas() {
    try {
        const [resultadoBanco] = await connection.raw(
            'SELECT DATABASE() AS banco'
        );

        const banco = resultadoBanco[0]?.banco;

        if (!banco) {
            throw new Error('Banco de dados nao identificado.');
        }

        console.log('Banco conectado:', banco);
        console.log('Iniciando verificacao das tabelas...');

        for (const tabela of tabelas) {
            const [existentes] = await connection.raw(
                `SELECT TABLE_NAME
                 FROM information_schema.TABLES
                 WHERE TABLE_SCHEMA = ?
                   AND TABLE_NAME = ?`,
                [banco, tabela.nome]
            );

            if (existentes.length > 0) {
                console.log(
                    `PRESERVADA: ${tabela.nome} ja existe.`
                );
                continue;
            }

            await connection.raw(tabela.sql);

            console.log(`CRIADA: ${tabela.nome}`);
        }

        console.log('\nCriacao concluida.');
        console.log(
            'Nenhuma tabela existente foi recriada ou substituida.'
        );

        console.log('\nEstruturas finais:');

        for (const tabela of tabelas) {
            const [estrutura] = await connection.raw(
                'SHOW CREATE TABLE ??',
                [tabela.nome]
            );

            console.log(`\n--- ${tabela.nome} ---`);
            console.log(estrutura[0]['Create Table']);
        }

    } catch (erro) {
        console.error('\nErro durante a criacao das tabelas:');
        console.error(erro.message);
        process.exitCode = 1;
    } finally {
        await connection.destroy();
    }
}

criarTabelas();
