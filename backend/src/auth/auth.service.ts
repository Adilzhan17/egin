import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { randomInt } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from '../users/dto/create-user.dto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async validateUser(phone: string, pass: string): Promise<any> {
    const user = await this.usersService.findByPhone(phone);
    if (user && (await bcrypt.compare(pass, user.passwordHash))) {
      const { passwordHash, ...result } = user;
      return result;
    }
    return null;
  }

  async login(loginDto: LoginDto) {
    const user = await this.validateUser(loginDto.phone, loginDto.password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    
    // Create JWT Token Payload
    const payload = { sub: user.id, phone: user.phone, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        fullName: user.fullName,
        phone: user.phone,
        role: user.role,
        region: user.region,
        district: user.district,
      }
    };
  }

  async register(createUserDto: CreateUserDto) {
    const newUser = await this.usersService.createPublicUser(createUserDto);
    
    // Auto-login after registration
    const payload = { sub: newUser.id, phone: newUser.phone, role: newUser.role };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: newUser.id,
        fullName: newUser.fullName,
        phone: newUser.phone,
        role: newUser.role,
        region: newUser.region,
        district: newUser.district,
      }
    };
  }

  // In-memory OTP storage. Single-instance only; move to Redis before scaling out.
  private otps = new Map<string, { code: string; expires: number; issuedAt: number; attempts: number }>();

  static readonly OTP_TTL_MS = 5 * 60 * 1000;
  static readonly OTP_MAX_ATTEMPTS = 5;
  static readonly OTP_RESEND_COOLDOWN_MS = 30 * 1000;
  static readonly PASSWORD_MIN_LENGTH = 6;
  static readonly PASSWORD_MAX_LENGTH = 72;

  /** Cryptographically secure 4-digit code. */
  protected generateCode(): string {
    return String(randomInt(1000, 10000));
  }

  async sendOtp(phone: string) {
    const existing = this.otps.get(phone);
    if (existing && Date.now() - existing.issuedAt < AuthService.OTP_RESEND_COOLDOWN_MS) {
      throw new HttpException('Please wait before requesting another code', HttpStatus.TOO_MANY_REQUESTS);
    }

    // The response is identical whether or not the account exists (no user enumeration).
    const code = this.generateCode();
    const now = Date.now();
    const expires = now + AuthService.OTP_TTL_MS;
    this.otps.set(phone, { code, expires, issuedAt: now, attempts: 0 });

    // No SMS provider is wired up yet, so the code is delivered through the server log.
    console.log(`[OTP] Sent to ${phone}: ${code}`);
    return { message: 'OTP sent successfully', expiresAt: expires };
  }

  async verifyOtp(phone: string, code: string) {
    const record = this.otps.get(phone);
    if (!record) throw new UnauthorizedException('Invalid or expired OTP');

    if (record.expires < Date.now()) {
      this.otps.delete(phone);
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    if (record.code !== code) {
      record.attempts += 1;
      // Too many wrong guesses: burn the code, a fresh one must be requested.
      if (record.attempts >= AuthService.OTP_MAX_ATTEMPTS) this.otps.delete(phone);
      throw new UnauthorizedException('Invalid or expired OTP');
    }
    return { valid: true };
  }

  async resetPassword(phone: string, code: string, newPassword: string) {
    if (
      typeof newPassword !== 'string' ||
      newPassword.length < AuthService.PASSWORD_MIN_LENGTH ||
      newPassword.length > AuthService.PASSWORD_MAX_LENGTH
    ) {
      throw new BadRequestException(
        `Password must be between ${AuthService.PASSWORD_MIN_LENGTH} and ${AuthService.PASSWORD_MAX_LENGTH} characters long`,
      );
    }

    await this.verifyOtp(phone, code);

    const user = await this.usersService.findByPhone(phone);
    if (!user) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.usersService.update(user.id, { passwordHash });

    this.otps.delete(phone);
    return { message: 'Password reset successfully' };
  }
}
