import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum ChatType {
  DIRECT = 'direct',
  REGIONAL = 'regional',
  GLOBAL = 'global',
  TRANSACTION = 'transaction',
}

@Entity('chats')
export class Chat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: ChatType, default: ChatType.DIRECT })
  type: ChatType;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'createdBy' })
  creator: User;

  @Column()
  createdBy: string;

  @Column({ nullable: true })
  listingId?: string;

  @Column({ nullable: true })
  region?: string;

  @Column({ nullable: true })
  district?: string;

  @Column({ nullable: true })
  village?: string;

  @Column({ nullable: true })
  cropType?: string;

  @Column({ nullable: true, unique: true })
  channelKey?: string;

  @Column({ nullable: true })
  channelLabel?: string;

  @Column({ default: false })
  isModerated: boolean;

  @OneToMany(() => ChatParticipant, (participant) => participant.chat, {
    cascade: true,
  })
  participants: ChatParticipant[];

  @OneToMany(() => ChatMessage, (message) => message.chat, {
    cascade: true,
  })
  messages: ChatMessage[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('chat_participants')
export class ChatParticipant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Chat, (chat) => chat.participants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'chatId' })
  chat: Chat;

  @Column()
  chatId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @Column({ type: 'timestamp', nullable: true })
  lastReadAt?: Date;

  @CreateDateColumn()
  createdAt: Date;
}

@Entity('chat_messages')
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Chat, (chat) => chat.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'chatId' })
  chat: Chat;

  @Column()
  chatId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'senderId' })
  sender: User;

  @Column()
  senderId: string;

  @Column({ default: 'text' })
  type: string;

  @Column('text')
  body: string;

  @Column({ nullable: true })
  attachmentUrl?: string;

  @Column('simple-json', { nullable: true })
  metadata?: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;
}
