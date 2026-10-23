import { prisma } from "@flowforge/database";
import { NotificationQueryInput, NotificationDto } from "@flowforge/shared";

export class NotificationService {
  async listNotifications(
    workspaceId: string,
    userId?: string,
    query?: NotificationQueryInput
  ): Promise<{
    notifications: NotificationDto[];
    unreadCount: number;
    pagination: { page: number; limit: number; total: number; pages: number };
  }> {
    const page = query?.page || 1;
    const limit = query?.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {
      workspaceId,
      OR: [{ userId: null }, { userId }],
    };

    if (query?.read !== undefined) {
      where.read = query.read;
    }

    if (query?.category) {
      where.category = query.category;
    }

    const [items, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({
        where: {
          workspaceId,
          read: false,
          OR: [{ userId: null }, { userId }],
        },
      }),
    ]);

    const notifications: NotificationDto[] = items.map((n) => ({
      id: n.id,
      workspaceId: n.workspaceId,
      userId: n.userId,
      type: n.type,
      title: n.title,
      message: n.message,
      link: n.link,
      category: n.category as any,
      read: n.read,
      readAt: n.readAt ? n.readAt.toISOString() : null,
      metadata: n.metadata,
      createdAt: n.createdAt.toISOString(),
    }));

    return {
      notifications,
      unreadCount,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async createNotification(params: {
    workspaceId: string;
    userId?: string | null;
    type: string;
    title: string;
    message: string;
    link?: string | null;
    category?: "info" | "warning" | "error" | "success";
    metadata?: any;
  }) {
    return prisma.notification.create({
      data: {
        workspaceId: params.workspaceId,
        userId: params.userId || null,
        type: params.type,
        title: params.title,
        message: params.message,
        link: params.link || null,
        category: params.category || "info",
        metadata: params.metadata || {},
      },
    });
  }

  async markAsRead(workspaceId: string, notificationId: string): Promise<boolean> {
    const res = await prisma.notification.updateMany({
      where: {
        id: notificationId,
        workspaceId,
      },
      data: {
        read: true,
        readAt: new Date(),
      },
    });
    return res.count > 0;
  }

  async markAllAsRead(workspaceId: string, userId?: string): Promise<number> {
    const res = await prisma.notification.updateMany({
      where: {
        workspaceId,
        read: false,
        OR: [{ userId: null }, { userId }],
      },
      data: {
        read: true,
        readAt: new Date(),
      },
    });
    return res.count;
  }
}

export const notificationService = new NotificationService();
