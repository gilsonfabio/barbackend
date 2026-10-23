
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

async function verificarTabelasMenuVivo() {
  try {
    const bancoConfigurado = process.env.DATABASE_NAME;

    if (bancoConfigurado !== 'innvento') {
      throw new Error(
        `Banco inesperado: ${bancoConfigurado}. Operação cancelada.`
      );
    }

    const existentes = [];

    for (const tabela of tabelasMenuVivo) {
      const existe = await db.schema.hasTable(tabela);

      if (existe) {
        existentes.push(tabela);
      }
    }

    console.log(`Banco verificado: ${bancoConfigurado}`);
    console.log('Tabelas reservadas para o MenuVivo:');

    console.table(
      tabelasMenuVivo.map((tabela) => ({
        tabela,
        situacao: existentes.includes(tabela)
          ? 'JÁ EXISTE — NÃO ALTERAR'
          : 'LIVRE PARA CRIAÇÃO',
      }))
    );

    if (existentes.length > 0) {
      console.warn(
        'Atenção: alguns nomes já existem. ' +
        'Investigue antes de criar qualquer tabela.'
      );
    } else {
      console.log(
        'Todos os nomes estão livres para a criação inicial.'
      );
    }
  } catch (erro) {
    console.error('Falha na verificação:', erro.message);
    process.exitCode = 1;
  } finally {
    await db.destroy();
  }
}

verificarTabelasMenuVivo();
