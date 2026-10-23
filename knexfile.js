require('dotenv/config');

function obterConfiguracaoBanco() {
    const {
        DATABASE_HOST,
        DATABASE_PORT,
        DATABASE_NAME,
        DATABASE_USER,
        DATABASE_PASSWORD,
    } = process.env;

    const obrigatorias = {
        DATABASE_HOST,
        DATABASE_NAME,
        DATABASE_USER,
        DATABASE_PASSWORD,
    };

    const ausentes = Object.entries(obrigatorias)
        .filter(([, valor]) => !valor)
        .map(([nome]) => nome);

    if (ausentes.length > 0) {
        throw new Error(
            `Variáveis de banco ausentes: ${ausentes.join(', ')}`
        );
    }

    return {
        host: DATABASE_HOST,
        port: Number(DATABASE_PORT || 3306),
        database: DATABASE_NAME,
        user: DATABASE_USER,
        password: DATABASE_PASSWORD,
        charset: 'utf8mb4',

        // Tempo limite para estabelecer uma nova conexão.
        connectTimeout: 10000,

        // Mantém o keep-alive TCP habilitado.
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
    };
}

function criarAmbiente() {
    return {
        client: 'mysql2',

        connection: obterConfiguracaoBanco(),

        pool: {
            // Não mantém conexões ociosas obrigatoriamente abertas.
            min: 0,
            max: 5,

            // Tempo máximo para aguardar uma conexão disponível.
            acquireTimeoutMillis: 60000,

            // Tempo máximo para criar uma conexão.
            createTimeoutMillis: 30000,

            // Libera conexões ociosas após 10 segundos.
            idleTimeoutMillis: 10000,

            // Verifica periodicamente as conexões ociosas.
            reapIntervalMillis: 1000,
        },

        useNullAsDefault: true,
    };
}

module.exports = {
    development: criarAmbiente(),
    production: criarAmbiente(),
};