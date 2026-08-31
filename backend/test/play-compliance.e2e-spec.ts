import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';

import { AppModule } from '../src/app.module';

describe('Play compliance APIs (e2e)', () => {
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
    if (app) await app.close();
  });

  async function registerUser(suffix: string) {
    const email = `comp_${suffix}@test.local`;
    const username = `comp_${suffix}`;
    const password = 'e2ePassword1';
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, username, password });
    expect([200, 201]).toContain(reg.status);
    return { email, password, token: reg.body.accessToken as string, userId: undefined as string | undefined };
  }

  it('rejects unauthenticated feed report', async () => {
    if (!app) {
      console.warn('Skipping e2e: set DATABASE_URL and run migrations.');
      return;
    }
    const res = await request(app.getHttpServer())
      .post('/api/v1/foursome-feed/nonexistent/report')
      .send({ reason: 'SPAM' });
    expect(res.status).toBe(401);
  });

  it('accepts terms on register and exposes needsTermsAcceptance=false', async () => {
    if (!app) {
      console.warn('Skipping e2e: set DATABASE_URL and run migrations.');
      return;
    }
    const u = await registerUser(`${Date.now()}`);
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${u.token}`)
      .expect(200);
    expect(me.body.needsTermsAcceptance).toBe(false);
    expect(me.body.termsVersion).toBeTruthy();
  });

  it('processes account deletion for the authenticated user only', async () => {
    if (!app) {
      console.warn('Skipping e2e: set DATABASE_URL and run migrations.');
      return;
    }
    const u = await registerUser(`del_${Date.now()}`);
    const del = await request(app.getHttpServer())
      .post('/api/v1/account/delete-request')
      .set('Authorization', `Bearer ${u.token}`)
      .send({ reason: 'e2e' });
    expect([200, 201]).toContain(del.status);
    expect(del.body.status).toBe('COMPLETED');
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: u.email, password: u.password });
    expect(login.status).toBeGreaterThanOrEqual(400);
  });
});
