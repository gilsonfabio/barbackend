const connection = require('../connection');

const tabelasParaVerificar = [
    'mv_estabelecimentos',
    'mv_mesas',
    'mv_produtos',
    'mv_pedidos',
    'mv_itens_pedido',
    'mv_comandas',
    'mv_itens_comanda',
    'mv_pagamentos'
];

async function verificarEsquema() {
    try {
        const [resultadoBanco] = await connection.raw(
            'SELECT DATABASE() AS banco'
        );

        const banco = resultadoBanco[0]?.banco;

        console.log('\n========================================');
        console.log('VERIFICACAO DO ESQUEMA DO MENUVIVO');
        console.log('========================================');
        console.log('Banco conectado:', banco || 'Nao identificado');

        if (!banco) {
            throw new Error(
                'Nao foi possivel identificar o banco conectado.'
            );
        }

        const [tabelasExistentes] = await connection.raw(
            `SELECT TABLE_NAME
             FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = ?
             ORDER BY TABLE_NAME`,
            [banco]
        );

        const nomesExistentes = new Set(
            tabelasExistentes.map(tabela => tabela.TABLE_NAME)
        );

        for (const nomeTabela of tabelasParaVerificar) {
            console.log('\n----------------------------------------');
            console.log('TABELA:', nomeTabela);

            if (!nomesExistentes.has(nomeTabela)) {
                console.log('SITUACAO: NAO EXISTE');
                continue;
            }

            console.log('SITUACAO: EXISTE');

            const [estrutura] = await connection.raw(
                'SHOW CREATE TABLE ??',
                [nomeTabela]
            );

            console.log(
                JSON.stringify(estrutura[0], null, 2)
            );
        }

        console.log('\n========================================');
        console.log('VERIFICACAO CONCLUIDA');
        console.log('Nenhuma estrutura foi modificada.');
        console.log('========================================\n');

    } catch (erro) {
        console.error('\nErro ao verificar o esquema:');
        console.error(erro.message);
        process.exitCode = 1;
    } finally {
        await connection.destroy();
    }
}

verificarEsquema();
