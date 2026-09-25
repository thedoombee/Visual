export const EXAMPLE_PRISMA = `model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String?
  posts     Post[]
  profile   Profile?
  createdAt DateTime @default(now())
  @@map("users")
}

model Profile {
  id     Int    @id @default(autoincrement())
  bio    String?
  userId Int    @unique @map("user_id")
  user   User   @relation(fields: [userId], references: [id])
  @@map("profiles")
}

model Post {
  id        Int      @id @default(autoincrement())
  title     String
  content   String?
  published Boolean  @default(false)
  authorId  Int      @map("author_id")
  author    User     @relation(fields: [authorId], references: [id])
  tags      Tag[]
  @@map("posts")
}

model Tag {
  id    Int    @id @default(autoincrement())
  label String @unique
  posts Post[]
  @@map("tags")
}`;

export const EXAMPLE_DRIZZLE = `import { pgTable, serial, text, varchar, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: text("name"),
  createdAt: timestamp("created_at").notNull(),
});

export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content"),
  published: boolean("published").notNull(),
  authorId: integer("author_id").notNull().references(() => users.id),
});`;

export const EXAMPLE_SQL = `CREATE TABLE "users" (
  "id" SERIAL PRIMARY KEY,
  "email" VARCHAR(255) NOT NULL UNIQUE,
  "name" TEXT,
  "created_at" TIMESTAMP NOT NULL
);

CREATE TABLE "posts" (
  "id" SERIAL PRIMARY KEY,
  "title" VARCHAR(255) NOT NULL,
  "content" TEXT,
  "published" BOOLEAN NOT NULL,
  "author_id" INTEGER NOT NULL,
  FOREIGN KEY ("author_id") REFERENCES "users"("id")
);

CREATE TABLE "tags" (
  "id" SERIAL PRIMARY KEY,
  "label" VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE "post_tags" (
  "post_id" INTEGER NOT NULL,
  "tag_id" INTEGER NOT NULL,
  PRIMARY KEY ("post_id", "tag_id"),
  FOREIGN KEY ("post_id") REFERENCES "posts"("id"),
  FOREIGN KEY ("tag_id") REFERENCES "tags"("id")
);`;
