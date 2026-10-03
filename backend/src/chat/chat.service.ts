import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, In, Repository } from 'typeorm';
import { FarmPlot } from '../farm-plots/entities/farm-plot.entity';
import { User } from '../users/entities/user.entity';
import {
  Chat,
  ChatMessage,
  ChatParticipant,
  ChatType,
} from './entities/chat.entity';
import {
  CreateDirectChatDto,
  SendMessageDto,
} from './dto/create-direct-chat.dto';

type CommunityChannelConfig = {
  type: ChatType;
  channelKey: string;
  channelLabel: string;
  region?: string | null;
  district?: string | null;
  village?: string | null;
  cropType?: string | null;
  isModerated: boolean;
};

@Injectable()
export class ChatService {
  private readonly blockedCommunityPatterns = [
    /казино/iu,
    /ставк/iu,
    /спам/iu,
    /spam/iu,
    /хуй/iu,
    /пизд/iu,
    /бля/iu,
    /сука/iu,
    /еба/iu,
  ];

  constructor(
    @InjectRepository(Chat)
    private readonly chatRepository: Repository<Chat>,
    @InjectRepository(ChatParticipant)
    private readonly participantRepository: Repository<ChatParticipant>,
    @InjectRepository(ChatMessage)
    private readonly messageRepository: Repository<ChatMessage>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(FarmPlot)
    private readonly plotRepository: Repository<FarmPlot>,
  ) {}

  private normalizeChannelPart(value: string) {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-zа-яәіңғүұқөһ0-9]+/giu, '-')
      .replace(/^-+|-+$/g, '');
  }

  private buildCommunityChannelPayload(chat: Chat) {
    if (chat.type === ChatType.DIRECT || chat.type === ChatType.TRANSACTION) {
      return null;
    }

    const scope = chat.cropType
      ? 'crop'
      : chat.village
        ? 'village'
        : chat.district
          ? 'district'
          : chat.region
            ? 'region'
            : 'global';

    return {
      key: chat.channelKey ?? chat.id,
      label: chat.channelLabel ?? 'Сообщество',
      scope,
      region: chat.region ?? null,
      district: chat.district ?? null,
      village: chat.village ?? null,
      cropType: chat.cropType ?? null,
      isModerated: Boolean(chat.isModerated),
    };
  }

  private async assertParticipant(chatId: string, userId: string) {
    const participant = await this.participantRepository.findOne({
      where: { chatId, userId },
    });

    if (!participant) {
      throw new ForbiddenException('You are not a participant of this chat');
    }
  }

  private validateCommunityMessage(body: string) {
    if (!body.trim()) {
      throw new BadRequestException('Message body is required');
    }

    if (body.length > 500) {
      throw new BadRequestException(
        'Community messages must be shorter than 500 characters',
      );
    }

    const externalLinks = body.match(/https?:\/\//gi) ?? [];
    if (externalLinks.length > 1) {
      throw new ForbiddenException(
        'Community channels do not allow bulk external links',
      );
    }

    if (
      this.blockedCommunityPatterns.some((pattern) => pattern.test(body.trim()))
    ) {
      throw new ForbiddenException(
        'Message blocked by community moderation rules',
      );
    }
  }

  private buildCommunityChannels(user: User, plots: FarmPlot[]) {
    const channels: CommunityChannelConfig[] = [];

    if (user.region) {
      channels.push({
        type: ChatType.REGIONAL,
        channelKey: `region:${this.normalizeChannelPart(user.region)}`,
        channelLabel: `Область: ${user.region}`,
        region: user.region,
        isModerated: true,
      });
    }

    if (user.region && user.district) {
      channels.push({
        type: ChatType.REGIONAL,
        channelKey: `district:${this.normalizeChannelPart(
          user.region,
        )}:${this.normalizeChannelPart(user.district)}`,
        channelLabel: `Район: ${user.district}`,
        region: user.region,
        district: user.district,
        isModerated: true,
      });
    }

    const village = plots.find((plot) => plot.village?.trim())?.village?.trim();
    if (user.region && user.district && village) {
      channels.push({
        type: ChatType.REGIONAL,
        channelKey: `village:${this.normalizeChannelPart(
          user.region,
        )}:${this.normalizeChannelPart(
          user.district,
        )}:${this.normalizeChannelPart(village)}`,
        channelLabel: `Село: ${village}`,
        region: user.region,
        district: user.district,
        village,
        isModerated: true,
      });
    }

    const cropTypes = Array.from(
      new Set(
        plots
          .map((plot) => plot.cropType?.trim())
          .filter((cropType): cropType is string => Boolean(cropType)),
      ),
    ).slice(0, 5);

    for (const cropType of cropTypes) {
      channels.push({
        type: ChatType.REGIONAL,
        channelKey: `crop:${this.normalizeChannelPart(cropType)}:${
          user.region ? this.normalizeChannelPart(user.region) : 'kz'
        }`,
        channelLabel: `Культура: ${cropType}`,
        region: user.region ?? null,
        cropType,
        isModerated: true,
      });
    }

    return channels;
  }

  private async ensureCommunityChannels(userId: string) {
    const [user, plots] = await Promise.all([
      this.userRepository.findOne({ where: { id: userId } }),
      this.plotRepository.find({
        where: { userId },
        order: { createdAt: 'DESC' },
      }),
    ]);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const channelConfigs = this.buildCommunityChannels(user, plots);
    if (channelConfigs.length === 0) {
      return [];
    }

    const existingChats = await this.chatRepository.find({
      where: channelConfigs.map((channel) => ({
        channelKey: channel.channelKey,
      })),
    });
    const existingByKey = new Map(
      existingChats.map((chat) => [chat.channelKey, chat]),
    );

    const missingConfigs = channelConfigs.filter(
      (channel) => !existingByKey.has(channel.channelKey),
    );

    const createdChatEntities: Chat[] = missingConfigs.map((channel) =>
      this.chatRepository.create({
        type: channel.type,
        createdBy: userId,
        region: channel.region ?? null,
        district: channel.district ?? null,
        village: channel.village ?? null,
        cropType: channel.cropType ?? null,
        channelKey: channel.channelKey,
        channelLabel: channel.channelLabel,
        isModerated: channel.isModerated,
      } as DeepPartial<Chat>),
    );

    const createdChats = createdChatEntities.length
      ? await this.chatRepository.save(createdChatEntities)
      : [];

    const chats = [...existingChats, ...createdChats];
    const chatIds = chats.map((chat) => chat.id);

    const existingParticipants = await this.participantRepository.find({
      where: {
        userId,
        chatId: In(chatIds),
      },
    });
    const existingParticipantIds = new Set(
      existingParticipants.map((participant) => participant.chatId),
    );

    const missingParticipants = chatIds.filter(
      (chatId) => !existingParticipantIds.has(chatId),
    );

    if (missingParticipants.length > 0) {
      await this.participantRepository.save(
        missingParticipants.map((chatId) =>
          this.participantRepository.create({
            chatId,
            userId,
          }),
        ),
      );
    }

    return chats;
  }

  private async loadUserMap(chats: Chat[]) {
    const userIds = Array.from(
      new Set(
        chats.flatMap((chat) => [
          ...(chat.participants ?? []).map((participant) => participant.userId),
          ...(chat.messages ?? []).map((message) => message.senderId),
        ]),
      ),
    );

    const users = userIds.length
      ? await this.userRepository.find({ where: { id: In(userIds) } })
      : [];

    return new Map(users.map((user) => [user.id, user]));
  }

  async createDirectChat(currentUserId: string, dto: CreateDirectChatDto) {
    if (currentUserId === dto.participantUserId) {
      throw new ForbiddenException('Cannot create a direct chat with yourself');
    }

    const participants = [currentUserId, dto.participantUserId].sort();

    const existingDirectChats = await this.chatRepository.find({
      where: {
        type: ChatType.DIRECT,
      },
      relations: ['participants'],
      order: { updatedAt: 'DESC' },
    });

    const existingChat = existingDirectChats.find((chat) => {
      const participantIds = (chat.participants ?? [])
        .map((participant) => participant.userId)
        .sort();

      return (
        participantIds.length === 2 &&
        participantIds[0] === participants[0] &&
        participantIds[1] === participants[1] &&
        (dto.listingId ? chat.listingId === dto.listingId : true)
      );
    });

    if (existingChat) {
      return this.getChatById(existingChat.id, currentUserId);
    }

    const users = await this.userRepository.find({
      where: { id: In(participants) },
    });

    if (users.length !== 2) {
      throw new NotFoundException('Participant user not found');
    }

    const chat = await this.chatRepository.save(
      this.chatRepository.create({
        type: ChatType.DIRECT,
        createdBy: currentUserId,
        listingId: dto.listingId,
      }),
    );

    await this.participantRepository.save(
      participants.map((userId) =>
        this.participantRepository.create({
          chatId: chat.id,
          userId,
        }),
      ),
    );

    return this.getChatById(chat.id, currentUserId);
  }

  async listChats(userId: string) {
    await this.ensureCommunityChannels(userId);

    const participations = await this.participantRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    const chatIds = participations.map((participant) => participant.chatId);
    if (chatIds.length === 0) {
      return [];
    }

    const chats = await this.chatRepository.find({
      where: { id: In(chatIds) },
      relations: ['participants', 'messages'],
      order: { updatedAt: 'DESC' },
    });
    const userMap = await this.loadUserMap(chats);

    return chats.map((chat) => {
      const isCommunity =
        chat.type === ChatType.REGIONAL || chat.type === ChatType.GLOBAL;
      const otherParticipants = (chat.participants ?? [])
        .filter((participant) => participant.userId !== userId)
        .map((participant) => {
          const user = userMap.get(participant.userId);

          return {
            userId: participant.userId,
            fullName: user?.fullName ?? 'Unknown user',
            role: user?.role ?? null,
            region: user?.region ?? null,
          };
        });

      const lastMessage = [...(chat.messages ?? [])].sort(
        (left, right) =>
          new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
      )[0];

      return {
        id: chat.id,
        type: chat.type,
        title: isCommunity
          ? chat.channelLabel ?? 'Сообщество'
          : otherParticipants[0]?.fullName ?? 'Чат',
        listingId: chat.listingId ?? null,
        participantCount: (chat.participants ?? []).length,
        participants: isCommunity ? [] : otherParticipants,
        channel: this.buildCommunityChannelPayload(chat),
        lastMessage: lastMessage
          ? {
              id: lastMessage.id,
              body: lastMessage.body,
              senderId: lastMessage.senderId,
              createdAt: lastMessage.createdAt,
            }
          : null,
        updatedAt: chat.updatedAt,
        createdAt: chat.createdAt,
      };
    });
  }

  async listCommunityChannels(userId: string) {
    const chats = await this.listChats(userId);
    return chats.filter((chat) => chat.channel);
  }

  async getChatById(chatId: string, userId: string) {
    await this.assertParticipant(chatId, userId);

    const chat = await this.chatRepository.findOne({
      where: { id: chatId },
      relations: ['participants', 'messages'],
      order: { messages: { createdAt: 'ASC' } },
    });

    if (!chat) {
      throw new NotFoundException('Chat not found');
    }

    const users = await this.userRepository.find({
      where: {
        id: In(
          Array.from(
            new Set([
              ...(chat.participants ?? []).map((participant) => participant.userId),
              ...(chat.messages ?? []).map((message) => message.senderId),
            ]),
          ),
        ),
      },
    });
    const userMap = new Map(users.map((user) => [user.id, user]));
    const isCommunity =
      chat.type === ChatType.REGIONAL || chat.type === ChatType.GLOBAL;
    const participants = (chat.participants ?? []).map((participant) => {
      const user = userMap.get(participant.userId);

      return {
        userId: participant.userId,
        fullName: user?.fullName ?? 'Unknown user',
        role: user?.role ?? null,
        region: user?.region ?? null,
      };
    });

    return {
      id: chat.id,
      type: chat.type,
      title: isCommunity
        ? chat.channelLabel ?? 'Сообщество'
        : participants.find((participant) => participant.userId !== userId)
            ?.fullName ??
          participants[0]?.fullName ??
          'Чат',
      listingId: chat.listingId ?? null,
      participantCount: participants.length,
      channel: this.buildCommunityChannelPayload(chat),
      participants: isCommunity ? [] : participants,
      messages: (chat.messages ?? []).map((message) => ({
        id: message.id,
        senderId: message.senderId,
        senderName: userMap.get(message.senderId)?.fullName ?? 'Unknown user',
        body: message.body,
        type: message.type,
        attachmentUrl: message.attachmentUrl ?? null,
        metadata: message.metadata ?? null,
        createdAt: message.createdAt,
      })),
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
    };
  }

  async sendMessage(chatId: string, userId: string, dto: SendMessageDto) {
    await this.assertParticipant(chatId, userId);

    const chat = await this.chatRepository.findOne({
      where: { id: chatId },
    });

    if (!chat) {
      throw new NotFoundException('Chat not found');
    }

    const body = dto.body?.trim();
    if (!body) {
      throw new BadRequestException('Message body is required');
    }

    if (chat.type === ChatType.REGIONAL || chat.type === ChatType.GLOBAL) {
      this.validateCommunityMessage(body);
    }

    const message = await this.messageRepository.save(
      this.messageRepository.create({
        chatId,
        senderId: userId,
        body,
        type: dto.type ?? 'text',
        attachmentUrl: dto.attachmentUrl,
        metadata: dto.metadata ?? null,
      }),
    );

    await this.chatRepository.update(chatId, {
      updatedAt: new Date(),
    });

    return {
      id: message.id,
      chatId: message.chatId,
      senderId: message.senderId,
      body: message.body,
      type: message.type,
      attachmentUrl: message.attachmentUrl ?? null,
      metadata: message.metadata ?? null,
      createdAt: message.createdAt,
    };
  }
}
