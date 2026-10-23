
const express = require('express');

const routes = express.Router();

routes.get('/', (request, response) => {
    return response.json({
        status: true,
        application: 'MenuVivo',
        message: 'Bem-vindo à API do MenuVivo!',
    });
});

routes.get('/health', (request, response) => {
    return response.status(200).json({
        status: true,
        message: 'API funcionando!',
    });
});

// Autenticação
routes.use('/auth', require('./auth.routes'));


 // Upload de imagens — acesso protegido
routes.use(
    '/uploads',
    require('../middlewares/auth'),
    require('../middlewares/estabelecimento'),
    require('./upload.routes')
);

routes.use(
    '/mesas',
    require('../middlewares/auth'),
    require('../middlewares/estabelecimento'),
    require('./mesa.routes')
);

// Categorias do cardápio
routes.use(
    '/categorias',
    require('../middlewares/auth'),
    require('../middlewares/estabelecimento'),
    require('./categoria.routes')
);

routes.use(
    '/subcategorias',
    require('../middlewares/auth'),
    require('../middlewares/estabelecimento'),
    require('./subcategoria.routes')
);

routes.use(
    '/produtos',
    require('../middlewares/auth'),
    require('../middlewares/estabelecimento'),
    require('./produto.routes')
);

// Cardápio público — sem autenticação
routes.use('/cardapio', require('./cardapio.routes'));

// Pedidos — módulo preservado
routes.use(
    '/pedidos',
    require('../middlewares/auth'),
    require('../middlewares/estabelecimento'),
    require('./pedido.routes')
);

// Comandas — módulo preservado
routes.use(
    '/comandas',
    require('../middlewares/auth'),
    require('../middlewares/estabelecimento'),
    require('./comanda.routes')
);

// Solicitações de consumo — acesso administrativo protegido
routes.use(
    '/solicitacoes-consumo',
    require('../middlewares/auth'),
    require('../middlewares/estabelecimento'),
    require('./solicitacao-consumo.routes')
);

module.exports = routes;

