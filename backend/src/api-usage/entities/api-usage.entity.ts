import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('api_usage')
export class ApiUsage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  provider: string; // 'google_maps'

  @Column({ default: 0 })
  callCount: number;

  @Column({ default: 28500 }) // Google Maps free limit ($200 ~ 28.5k loads)
  monthlyLimit: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
