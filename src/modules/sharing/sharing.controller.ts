import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import {
  StartSharingDto,
  UpdateLocationDto,
  UpdateSharingDurationDto,
  UpdateVisibilityDto,
} from './dto/sharing.dto';
import { SharingService } from './sharing.service';

@Controller('sharing/sessions')
export class SharingController {
  constructor(private readonly sharingService: SharingService) {}

  @Get('active')
  active(@CurrentUser() user: AuthenticatedUser) {
    return this.sharingService.getActiveSession(user.id);
  }

  @Post()
  start(@CurrentUser() user: AuthenticatedUser, @Body() dto: StartSharingDto) {
    return this.sharingService.startSession(user.id, dto);
  }

  @Patch(':sessionId')
  updateDuration(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId') sessionId: string,
    @Body() dto: UpdateSharingDurationDto,
  ) {
    return this.sharingService.updateDuration(user.id, sessionId, dto);
  }

  @Post(':sessionId/stop')
  @HttpCode(HttpStatus.NO_CONTENT)
  async stop(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId') sessionId: string,
  ) {
    await this.sharingService.stopSession(user.id, sessionId);
  }

  @Post('stop-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  async stopAll(@CurrentUser() user: AuthenticatedUser) {
    await this.sharingService.stopSession(user.id);
  }

  @Post(':sessionId/location')
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateLocation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId') sessionId: string,
    @Body() dto: UpdateLocationDto,
  ) {
    await this.sharingService.updateLocation(user.id, sessionId, dto);
  }

  @Put(':sessionId/visibility')
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateVisibility(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId') sessionId: string,
    @Body() dto: UpdateVisibilityDto,
  ) {
    await this.sharingService.updateVisibility(user.id, sessionId, dto);
  }
}

@Controller('groups')
export class GroupLocationsController {
  constructor(private readonly sharingService: SharingService) {}

  @Get(':groupId/locations')
  locations(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
  ) {
    return this.sharingService.getGroupLocations(user.id, groupId);
  }
}
