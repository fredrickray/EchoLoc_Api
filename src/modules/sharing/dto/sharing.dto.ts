import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

import { DURATION_IDS } from '../../../common/constants/sharing.constants';

export class StartSharingDto {
  @IsUUID('4')
  groupId!: string;

  @IsString()
  @IsIn(DURATION_IDS)
  durationId!: string;
}

export class UpdateSharingDurationDto {
  @IsString()
  @IsIn(DURATION_IDS)
  durationId!: string;
}

export class UpdateLocationDto {
  @IsNumber()
  latitude!: number;

  @IsNumber()
  longitude!: number;

  @IsOptional()
  @IsString()
  label?: string;
}

export class UpdateVisibilityDto {
  @IsUUID('4')
  memberId!: string;

  @IsBoolean()
  canSeeMe!: boolean;
}
