module.exports = function estabelecimento(request, response, next) {
    const estabelecimentoId = request.user?.estabelecimentoId;

    if (!estabelecimentoId) {
        return response.status(403).json({
            status: false,
            message: 'Usuário sem estabelecimento associado.',
        });
    }

    // O ID vem do JWT já validado pelo middleware auth.
    // Não use estabelecimentoId enviado pelo body ou pela URL.
    request.estabelecimentoId = estabelecimentoId;

    return next();
};
