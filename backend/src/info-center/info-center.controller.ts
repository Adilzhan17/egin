import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { InfoCenterService } from './info-center.service';

@ApiTags('Info Center')
@Controller('info-center')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class InfoCenterController {
  constructor(private readonly infoCenterService: InfoCenterService) {}

  @Get('categories')
  @ApiOperation({ summary: 'Return supported info-center categories.' })
  async getCategories() {
    const data = await this.infoCenterService.getCategories();
    return { success: true, data };
  }

  @Get('feed')
  @ApiOperation({ summary: 'Return info-center feed for the current user.' })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'featured', required: false })
  async getFeed(
    @Req() _req: { user: { id: string } },
    @Query('category') category?: string,
    @Query('featured') featured?: string,
  ) {
    const data = await this.infoCenterService.getFeed({
      category,
      region: null,
      featuredOnly: featured === 'true',
    });

    return { success: true, data };
  }

  @Get('articles')
  @ApiOperation({ summary: 'Return info-center articles (alias for feed).' })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'featured', required: false })
  async getArticles(
    @Req() _req: { user: { id: string } },
    @Query('category') category?: string,
    @Query('featured') featured?: string,
  ) {
    const data = await this.infoCenterService.getFeed({
      category,
      region: null,
      featuredOnly: featured === 'true',
    });

    return { success: true, data };
  }
}
