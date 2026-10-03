import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChatService } from './chat.service';
import { CreateDirectChatDto, SendMessageDto } from './dto/create-direct-chat.dto';

@ApiTags('Chat')
@Controller('chats')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('direct')
  @ApiOperation({ summary: 'Create or reuse a direct chat with another user.' })
  async createDirect(
    @Req() req: { user: { id: string } },
    @Body() dto: CreateDirectChatDto,
  ) {
    const data = await this.chatService.createDirectChat(req.user.id, dto);
    return { success: true, data };
  }

  @Get()
  @ApiOperation({ summary: 'List current user chats.' })
  async listChats(@Req() req: { user: { id: string } }) {
    const data = await this.chatService.listChats(req.user.id);
    return { success: true, data };
  }

  @Get('channels')
  @ApiOperation({ summary: 'List and auto-join community channels for the current user.' })
  async listChannels(@Req() req: { user: { id: string } }) {
    const data = await this.chatService.listCommunityChannels(req.user.id);
    return { success: true, data };
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Get a chat with ordered messages.' })
  async getMessages(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    const data = await this.chatService.getChatById(id, req.user.id);
    return { success: true, data };
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Send a message into a direct chat.' })
  async sendMessage(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    const data = await this.chatService.sendMessage(id, req.user.id, dto);
    return { success: true, data };
  }
}
