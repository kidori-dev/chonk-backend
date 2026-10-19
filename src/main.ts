import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { setupSwagger } from './swagger.setup';

/** API 서버 진입점. 예) npm run start:dev */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // 모든 API 주소 앞에 /api 를 붙인다. 예) POST /api/auth/login
  app.setGlobalPrefix('api');

  // 요청 body 를 DTO 규칙(class-validator)으로 검사한다. DTO 에 없는 필드가 오면 400
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  // production 이 아닐 때만 /api/docs 에 Swagger 문서를 띄운다
  setupSwagger(app);

  const port = config.get<number>('port')!;
  await app.listen(port);
  Logger.log(`API: http://localhost:${port}/api (NODE_ENV=${config.get('nodeEnv')})`, 'Bootstrap');
}

void bootstrap();
