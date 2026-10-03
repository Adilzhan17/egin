import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return API metadata', () => {
      expect(appController.getRoot()).toEqual(
        expect.objectContaining({
          name: 'AgriPlan API',
          status: 'ok',
          healthPath: '/health',
        }),
      );
    });
  });

  describe('health', () => {
    it('should return an ok health payload', () => {
      expect(appController.getHealth()).toEqual(
        expect.objectContaining({
          status: 'ok',
          environment: expect.any(String),
        }),
      );
    });
  });
});
