import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express5';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { connectDB } from './config/db.js';
import redis from './config/redis.js';
import { typeDefs } from './graphql/typeDefs.js';
import { resolvers } from './graphql/resolvers.js';

async function start() {
  await connectDB();

  try {
    await redis.connect();
    console.log('Redis connected');
  } catch {
    console.warn('Redis unavailable — caching disabled');
  }

  const app = express();
  const httpServer = http.createServer(app);

  const server = new ApolloServer({
    typeDefs,
    resolvers,
    plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
  });

  await server.start();

  app.use('/graphql', cors<cors.CorsRequest>(), express.json(), expressMiddleware(server));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  const PORT = parseInt(process.env.PORT ?? '4000', 10);
  await new Promise<void>((resolve) => httpServer.listen({ port: PORT }, resolve));

  console.log(`GraphQL ready at http://localhost:${PORT}/graphql`);
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
