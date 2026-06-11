import { PrismaConfig } from 'prisma/config';

export default {
  earlyAccess: true,
  studio: {
    port: 5555,
  },
  schema: {
    kind: 'single',
    filePath: './prisma/schema.prisma',
  },
  migrations: {
    url: 'file:./dev.db',
  }
} satisfies PrismaConfig;
