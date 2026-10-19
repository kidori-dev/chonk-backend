import { INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

const DOCS_PATH = 'api/docs';

/**
 * Swagger 문서: http://localhost:<PORT>/api/docs (JSON: /api/docs/json)
 * NODE_ENV=production 이면 켜지 않는다 (운영에서 API 목록을 노출하지 않기 위해).
 *
 * 인증이 필요한 API 호출 방법: POST /api/auth/login 으로 받은 accessToken 을
 * 오른쪽 위 Authorize 에 넣는다. 새로고침해도 유지된다.
 */
export function setupSwagger(app: INestApplication): void {
  const config = app.get(ConfigService);
  if (config.get<string>('nodeEnv') === 'production') {
    return;
  }

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('coin-sweep API')
      .setDescription(
        '로그인 후 받은 accessToken 을 Authorize 에 넣으면 인증 API 를 호출할 수 있다.',
      )
      .setVersion('0.0.1')
      .addBearerAuth()
      .build(),
  );

  SwaggerModule.setup(DOCS_PATH, app, document, {
    jsonDocumentUrl: `${DOCS_PATH}/json`,
    swaggerOptions: {
      persistAuthorization: true, // 새로고침해도 Authorize 에 넣은 토큰 유지
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  Logger.log(`Swagger: /${DOCS_PATH}`, 'Bootstrap');
}
