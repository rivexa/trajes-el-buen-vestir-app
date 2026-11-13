import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

function orígenesCors(): boolean | string[] {
  const raw = process.env.CORS_ORIGIN?.trim();
  if (!raw) {
    // Sin variable: abierto (útil en local). En deploy define CORS_ORIGIN.
    return true;
  }
  return raw.split(',').map((origen) => origen.trim()).filter(Boolean);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: orígenesCors(),
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  const config = new DocumentBuilder()
    .setTitle('API de Facturación - Trajes El Buen Vestir')
    .setDescription('Motor de facturación electrónica y comunicación con el SRI')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT || 3000);
}
bootstrap();
