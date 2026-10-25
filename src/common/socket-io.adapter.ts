import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Server, ServerOptions } from 'socket.io';

/**
 * Socket.IO 에 CORS 를 건다. 브라우저는 소켓만 백엔드 주소로 직접 붙기 때문이다
 * (프론트의 /api/* 는 Next rewrites 로 넘기지만, Vercel rewrites 는 웹소켓을 넘기지 못한다).
 */
export class SocketIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly corsOrigins: string[],
  ) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    return super.createIOServer(port, {
      ...options,
      cors: { origin: this.corsOrigins },
    }) as Server;
  }
}
