import type {
  ChatMessage,
  ChatMessageType as PrismaChatMessageType,
  User,
} from '@prisma/client';

import { getInitials } from '../../common/utils/crypto.util';
import type {
  ChatMessageResponse,
  ChatMessageType,
} from './dto/chat-response.dto';

const TYPE_MAP: Record<PrismaChatMessageType, ChatMessageType> = {
  TEXT: 'text',
  LOCATION: 'location',
  SYSTEM: 'system',
};

export function toChatMessageResponse(
  message: ChatMessage & { user?: User | null },
): ChatMessageResponse {
  return {
    id: message.id,
    groupId: message.groupId,
    type: TYPE_MAP[message.type],
    body: message.body,
    latitude: message.latitude ?? undefined,
    longitude: message.longitude ?? undefined,
    locationLabel: message.locationLabel ?? undefined,
    createdAt: message.createdAt.toISOString(),
    sender: message.user
      ? {
          id: message.user.id,
          name: message.user.name,
          handle: `@${message.user.handle}`,
          initials: getInitials(message.user.name),
          avatarBg: message.user.avatarBg,
          avatarColor: message.user.avatarColor,
        }
      : null,
  };
}
