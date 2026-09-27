export interface StarterPack {
  id: string;
  numero: string;
  titre: string;
  tagline: string;
  description: string;
  sql: string;
}

export const STARTERS: StarterPack[] = [
  {
    id: "blog",
    numero: "01",
    titre: "BLOG / CMS",
    tagline: "users + posts + tags + comments",
    description: "Le socle éditorial. Se relie à tout : un e-commerce ajoute des products, un SaaS ajoute des subscriptions.",
    sql: `CREATE TABLE "users" (
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
);
CREATE TABLE "comments" (
  "id" SERIAL PRIMARY KEY,
  "body" TEXT NOT NULL,
  "post_id" INTEGER NOT NULL,
  "author_id" INTEGER NOT NULL,
  "created_at" TIMESTAMP NOT NULL,
  FOREIGN KEY ("post_id") REFERENCES "posts"("id"),
  FOREIGN KEY ("author_id") REFERENCES "users"("id")
);`,
  },
  {
    id: "ecommerce",
    numero: "02",
    titre: "E-COMMERCE",
    tagline: "orders + products + payments",
    description: "Panier complet. customers se relie à users (1:1), products à post_tags pour le contenu.",
    sql: `CREATE TABLE "customers" (
  "id" SERIAL PRIMARY KEY,
  "email" VARCHAR(255) NOT NULL UNIQUE,
  "full_name" VARCHAR(255) NOT NULL,
  "created_at" TIMESTAMP NOT NULL
);
CREATE TABLE "categories" (
  "id" SERIAL PRIMARY KEY,
  "label" VARCHAR(100) NOT NULL UNIQUE
);
CREATE TABLE "products" (
  "id" SERIAL PRIMARY KEY,
  "name" VARCHAR(255) NOT NULL,
  "price" DECIMAL NOT NULL,
  "category_id" INTEGER,
  FOREIGN KEY ("category_id") REFERENCES "categories"("id")
);
CREATE TABLE "orders" (
  "id" SERIAL PRIMARY KEY,
  "customer_id" INTEGER NOT NULL,
  "status" VARCHAR(50) NOT NULL,
  "created_at" TIMESTAMP NOT NULL,
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
);
CREATE TABLE "order_items" (
  "order_id" INTEGER NOT NULL,
  "product_id" INTEGER NOT NULL,
  "qty" INTEGER NOT NULL,
  PRIMARY KEY ("order_id", "product_id"),
  FOREIGN KEY ("order_id") REFERENCES "orders"("id"),
  FOREIGN KEY ("product_id") REFERENCES "products"("id")
);
CREATE TABLE "payments" (
  "id" SERIAL PRIMARY KEY,
  "order_id" INTEGER NOT NULL UNIQUE,
  "amount" DECIMAL NOT NULL,
  "paid_at" TIMESTAMP,
  FOREIGN KEY ("order_id") REFERENCES "orders"("id")
);`,
  },
  {
    id: "saas",
    numero: "03",
    titre: "SAAS / AUTH",
    tagline: "plans + subscriptions + invoices",
    description: "Auth + abonnements. users est partagé avec le lot Blog — charge les deux pour un SaaS avec contenu.",
    sql: `CREATE TABLE "users" (
  "id" SERIAL PRIMARY KEY,
  "email" VARCHAR(255) NOT NULL UNIQUE,
  "password_hash" TEXT NOT NULL,
  "created_at" TIMESTAMP NOT NULL
);
CREATE TABLE "sessions" (
  "id" UUID PRIMARY KEY,
  "user_id" INTEGER NOT NULL,
  "expires_at" TIMESTAMP NOT NULL,
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
);
CREATE TABLE "plans" (
  "id" SERIAL PRIMARY KEY,
  "code" VARCHAR(50) NOT NULL UNIQUE,
  "price" DECIMAL NOT NULL
);
CREATE TABLE "subscriptions" (
  "id" SERIAL PRIMARY KEY,
  "user_id" INTEGER NOT NULL,
  "plan_id" INTEGER NOT NULL,
  "status" VARCHAR(50) NOT NULL,
  FOREIGN KEY ("user_id") REFERENCES "users"("id"),
  FOREIGN KEY ("plan_id") REFERENCES "plans"("id")
);
CREATE TABLE "invoices" (
  "id" SERIAL PRIMARY KEY,
  "subscription_id" INTEGER NOT NULL,
  "amount" DECIMAL NOT NULL,
  "paid_at" TIMESTAMP,
  FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id")
);`,
  },
  {
    id: "social",
    numero: "04",
    titre: "RÉSEAU SOCIAL",
    tagline: "follows + likes + messages",
    description: "Graph social. users est le pivot : combine avec Blog pour likes sur posts.",
    sql: `CREATE TABLE "users" (
  "id" SERIAL PRIMARY KEY,
  "handle" VARCHAR(50) NOT NULL UNIQUE,
  "bio" TEXT,
  "created_at" TIMESTAMP NOT NULL
);
CREATE TABLE "follows" (
  "follower_id" INTEGER NOT NULL,
  "followed_id" INTEGER NOT NULL,
  "created_at" TIMESTAMP NOT NULL,
  PRIMARY KEY ("follower_id", "followed_id"),
  FOREIGN KEY ("follower_id") REFERENCES "users"("id"),
  FOREIGN KEY ("followed_id") REFERENCES "users"("id")
);
CREATE TABLE "posts" (
  "id" SERIAL PRIMARY KEY,
  "body" TEXT NOT NULL,
  "author_id" INTEGER NOT NULL,
  "created_at" TIMESTAMP NOT NULL,
  FOREIGN KEY ("author_id") REFERENCES "users"("id")
);
CREATE TABLE "likes" (
  "user_id" INTEGER NOT NULL,
  "post_id" INTEGER NOT NULL,
  PRIMARY KEY ("user_id", "post_id"),
  FOREIGN KEY ("user_id") REFERENCES "users"("id"),
  FOREIGN KEY ("post_id") REFERENCES "posts"("id")
);
CREATE TABLE "messages" (
  "id" SERIAL PRIMARY KEY,
  "sender_id" INTEGER NOT NULL,
  "receiver_id" INTEGER NOT NULL,
  "body" TEXT NOT NULL,
  FOREIGN KEY ("sender_id") REFERENCES "users"("id"),
  FOREIGN KEY ("receiver_id") REFERENCES "users"("id")
);`,
  },
  {
    id: "ecole",
    numero: "05",
    titre: "ÉCOLE",
    tagline: "courses + enrollments + grades",
    description: "Pédagogie. enrollments est la table pivot N:N entre students et courses.",
    sql: `CREATE TABLE "students" (
  "id" SERIAL PRIMARY KEY,
  "full_name" VARCHAR(255) NOT NULL,
  "email" VARCHAR(255) NOT NULL UNIQUE
);
CREATE TABLE "teachers" (
  "id" SERIAL PRIMARY KEY,
  "full_name" VARCHAR(255) NOT NULL,
  "subject" VARCHAR(100)
);
CREATE TABLE "courses" (
  "id" SERIAL PRIMARY KEY,
  "title" VARCHAR(255) NOT NULL,
  "teacher_id" INTEGER,
  FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id")
);
CREATE TABLE "enrollments" (
  "student_id" INTEGER NOT NULL,
  "course_id" INTEGER NOT NULL,
  "enrolled_at" TIMESTAMP NOT NULL,
  PRIMARY KEY ("student_id", "course_id"),
  FOREIGN KEY ("student_id") REFERENCES "students"("id"),
  FOREIGN KEY ("course_id") REFERENCES "courses"("id")
);
CREATE TABLE "grades" (
  "id" SERIAL PRIMARY KEY,
  "student_id" INTEGER NOT NULL,
  "course_id" INTEGER NOT NULL,
  "score" FLOAT NOT NULL,
  FOREIGN KEY ("student_id") REFERENCES "students"("id"),
  FOREIGN KEY ("course_id") REFERENCES "courses"("id")
);`,
  },
  {
    id: "immo",
    numero: "06",
    titre: "IMMO / RENDEZ-VOUS",
    tagline: "properties + visits + contracts",
    description: "Agence. visits relie clients ↔ properties, contracts scelle la visite gagnante.",
    sql: `CREATE TABLE "agents" (
  "id" SERIAL PRIMARY KEY,
  "full_name" VARCHAR(255) NOT NULL,
  "phone" VARCHAR(30)
);
CREATE TABLE "clients" (
  "id" SERIAL PRIMARY KEY,
  "full_name" VARCHAR(255) NOT NULL,
  "email" VARCHAR(255) UNIQUE
);
CREATE TABLE "properties" (
  "id" SERIAL PRIMARY KEY,
  "title" VARCHAR(255) NOT NULL,
  "city" VARCHAR(100) NOT NULL,
  "price" DECIMAL NOT NULL,
  "agent_id" INTEGER,
  FOREIGN KEY ("agent_id") REFERENCES "agents"("id")
);
CREATE TABLE "visits" (
  "id" SERIAL PRIMARY KEY,
  "property_id" INTEGER NOT NULL,
  "client_id" INTEGER NOT NULL,
  "visit_at" TIMESTAMP NOT NULL,
  FOREIGN KEY ("property_id") REFERENCES "properties"("id"),
  FOREIGN KEY ("client_id") REFERENCES "clients"("id")
);
CREATE TABLE "contracts" (
  "id" SERIAL PRIMARY KEY,
  "visit_id" INTEGER NOT NULL UNIQUE,
  "signed_at" TIMESTAMP NOT NULL,
  FOREIGN KEY ("visit_id") REFERENCES "visits"("id")
);`,
  },
];
