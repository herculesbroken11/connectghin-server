import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';

import { AppModule } from '../src/app.module';

describe('Auth API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      return;
    }
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('registers, logs in, and returns /auth/me', async () => {
    if (!app) {
      console.warn('Skipping e2e: set DATABASE_URL and run migrations.');
      return;
    }
    const suffix = Date.now();
    const email = `e2e_${suffix}@test.local`;
    const username = `e2e_${suffix}`;
    const password = 'e2ePassword1';

    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, username, password })
      .expect((res) => {
        expect([200, 201]).toContain(res.status);
      });
    expect(reg.body.accessToken).toBeDefined();

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    expect(login.body.accessToken).toBeDefined();

    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);
    expect(me.body.email).toBe(email.toLowerCase());
  });
});
