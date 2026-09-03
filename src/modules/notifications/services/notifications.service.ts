import { Injectable } from '@nestjs/common';

@Injectable()
export class NotificationsService {
  findAll() {
    return {
      message: 'Notifications retrieved successfully',
      data: [],
    };
  }
}
