import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { getPagination, parseSortQuery } from 'src/common/utils/query.util';
import type { JwtPayload } from 'src/infrastructure/auth/types/jwt-payload';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { ListNotificationsQueryDto } from '../dto/list-notifications-query.dto';

const NOTIFICATION_SORT_FIELDS = ['createdAt'] as const;

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) { }

  async findAll(currentUser: JwtPayload, query: ListNotificationsQueryDto) {
    const { page, limit, skip } = getPagination(query);
    const orderBy = parseSortQuery(query.sort, NOTIFICATION_SORT_FIELDS);

    const where: Prisma.NotificationWhereInput = {
      receiverId: currentUser.sub,
      ...(query.unreadOnly === true ? { isRead: false } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        select: {
          id: true,
          type: true,
          title: true,
          message: true,
          isRead: true,
          productRequestId: true,
          createdAt: true,
          productRequest: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      message: 'Notifications retrieved successfully',
      data: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }

  async markAsRead(id: string, currentUser: JwtPayload) {
    const notification = await this.prisma.notification.findFirst({
      where: {
        id,
        receiverId: currentUser.sub,
      },
      select: { id: true, isRead: true },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (!notification.isRead) {
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: { isRead: true },
      });
    }

    return {
      message: 'Notification marked as read',
      data: null,
    };
  }

  async markAllAsRead(currentUser: JwtPayload) {
    await this.prisma.notification.updateMany({
      where: {
        receiverId: currentUser.sub,
        isRead: false,
      },
      data: { isRead: true },
    });

    return {
      message: 'All notifications marked as read',
      data: null,
    };
  }
}
