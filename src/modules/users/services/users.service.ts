import { Injectable } from '@nestjs/common';

@Injectable()
export class UsersService {
  findAll() {
    return {
      message: 'Users retrieved successfully',
      data: [],
    };
  }
}
