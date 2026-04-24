import { Injectable, ConflictException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  private async hashPassword(password: string) {
    const saltRounds = 10;
    return bcrypt.hash(password, saltRounds);
  }

  async create(createUserDto: CreateUserDto): Promise<User> {
    const existingUser = await this.usersRepository.findOne({
      where: { phone: createUserDto.phone },
    });

    if (existingUser) {
      throw new ConflictException('User with this phone number already exists');
    }

    const passwordHash = await this.hashPassword(createUserDto.password);

    const user = this.usersRepository.create({
      ...createUserDto,
      passwordHash,
    });

    return this.usersRepository.save(user);
  }

  async createPublicUser(createUserDto: CreateUserDto): Promise<User> {
    if (createUserDto.role === UserRole.ADMIN) {
      throw new ForbiddenException(
        'Admin accounts cannot be created via public registration',
      );
    }

    return this.create({
      ...createUserDto,
      role: createUserDto.role ?? UserRole.FARMER,
    });
  }

  async ensureAdminUser(input: {
    phone: string;
    password: string;
    fullName: string;
    region: string;
    district: string;
  }) {
    const existingUser = await this.usersRepository.findOne({
      where: { phone: input.phone },
    });
    const passwordHash = await this.hashPassword(input.password);

    if (existingUser) {
      existingUser.fullName = input.fullName;
      existingUser.region = input.region;
      existingUser.district = input.district;
      existingUser.role = UserRole.ADMIN;
      existingUser.passwordHash = passwordHash;
      return this.usersRepository.save(existingUser);
    }

    return this.usersRepository.save(
      this.usersRepository.create({
        fullName: input.fullName,
        phone: input.phone,
        passwordHash,
        role: UserRole.ADMIN,
        region: input.region,
        district: input.district,
      }),
    );
  }

  async ensureUser(input: {
    phone: string;
    password: string;
    fullName: string;
    role: UserRole;
    region: string;
    district: string;
    email?: string | null;
  }): Promise<User> {
    const existingUser = await this.usersRepository.findOne({
      where: { phone: input.phone },
    });
    const passwordHash = await this.hashPassword(input.password);

    if (existingUser) {
      existingUser.fullName = input.fullName;
      existingUser.region = input.region;
      existingUser.district = input.district;
      existingUser.role = input.role;
      existingUser.passwordHash = passwordHash;
      existingUser.email = input.email ?? null;
      return this.usersRepository.save(existingUser);
    }

    return this.usersRepository.save(
      this.usersRepository.create({
        fullName: input.fullName,
        phone: input.phone,
        passwordHash,
        role: input.role,
        region: input.region,
        district: input.district,
        email: input.email ?? undefined,
      }),
    );
  }

  async updateProfile(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    if (dto.phone && dto.phone !== user.phone) {
      const existing = await this.usersRepository.findOne({ where: { phone: dto.phone } });
      if (existing) throw new ConflictException('Phone number already in use');
    }

    Object.assign(user, dto);
    return this.usersRepository.save(user);
  }

  async findByPhone(phone: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { phone } });
  }

  async findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  async update(id: string, partialUser: Partial<User>): Promise<User> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('User not found');
    Object.assign(user, partialUser);
    return this.usersRepository.save(user);
  }
}
