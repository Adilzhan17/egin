import { Injectable, UnauthorizedException } from '@nestjs/common';
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

  // In-memory OTP storage (for demo/development)
  private otps = new Map<string, { code: string; expires: number }>();

  async sendOtp(phone: string) {
    // Check if user exists
    const user = await this.usersService.findByPhone(phone);
    if (!user) {
      // For security, don't reveal if user exists, but here we might want to tell them to sign up
      // In this specific flow, they are in "Forgot Password", so they should exist
    }

    const code = Math.floor(1000 + Math.random() * 9000).toString();
    const expires = Date.now() + 5 * 60 * 1000; // 5 minutes
    this.otps.set(phone, { code, expires });

    console.log(`[OTP] Sent to ${phone}: ${code}`);
    return { message: 'OTP sent successfully', expiresAt: expires };
  }

  async verifyOtp(phone: string, code: string) {
    const record = this.otps.get(phone);
    if (!record || record.code !== code || record.expires < Date.now()) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }
    return { valid: true };
  }

  async resetPassword(phone: string, code: string, newPassword: string) {
    await this.verifyOtp(phone, code);
    
    const user = await this.usersService.findByPhone(phone);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.usersService.update(user.id, { passwordHash });
    
    this.otps.delete(phone);
    return { message: 'Password reset successfully' };
  }
}
