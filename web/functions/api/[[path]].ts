import app from "../_routes/app";

export const onRequest: PagesFunction = (ctx) =>
  app.fetch(ctx.request, ctx.env, {
    waitUntil: (promise) => ctx.waitUntil(promise),
    passThroughOnException: () => ctx.passThroughOnException(),
    props: {},
  });
