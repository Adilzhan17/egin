import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('crops')
export class Crop {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;      // e.g., 'Арбуз', 'Пшеница'

  @Column()
  category: string;  // e.g., 'Овощи', 'Зерновые', 'Бахчевые'

  @Column({ default: '#C6A85E' })
  color: string;     // UI default marker color based on design

  @Column({ nullable: true })
  icon: string;      // icon identifier string or URL

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
