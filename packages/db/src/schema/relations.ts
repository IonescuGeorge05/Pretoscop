import { relations } from 'drizzle-orm';
import { brands, categories, productFamilies, productGtins, productImages, productSpecs, products } from './catalog';
import { matchCandidates, matchDecisions } from './matching';
import { offers, priceEvents, productDaily, productStats } from './offers';
import { affiliatePrograms, ingestRuns, shopSources, shops } from './shops';

export const shopsRelations = relations(shops, ({ many }) => ({
  sources: many(shopSources),
  offers: many(offers),
  affiliatePrograms: many(affiliatePrograms),
}));

export const affiliateProgramsRelations = relations(affiliatePrograms, ({ one }) => ({
  shop: one(shops, { fields: [affiliatePrograms.shopId], references: [shops.id] }),
}));

export const shopSourcesRelations = relations(shopSources, ({ one, many }) => ({
  shop: one(shops, { fields: [shopSources.shopId], references: [shops.id] }),
  runs: many(ingestRuns),
}));

export const ingestRunsRelations = relations(ingestRuns, ({ one }) => ({
  source: one(shopSources, { fields: [ingestRuns.sourceId], references: [shopSources.id] }),
}));

export const brandsRelations = relations(brands, ({ many }) => ({ products: many(products) }));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: 'category_parent',
  }),
  children: many(categories, { relationName: 'category_parent' }),
  products: many(products),
}));

export const productFamiliesRelations = relations(productFamilies, ({ one, many }) => ({
  brand: one(brands, { fields: [productFamilies.brandId], references: [brands.id] }),
  category: one(categories, { fields: [productFamilies.categoryId], references: [categories.id] }),
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  brand: one(brands, { fields: [products.brandId], references: [brands.id] }),
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  family: one(productFamilies, { fields: [products.familyId], references: [productFamilies.id] }),
  gtins: many(productGtins),
  images: many(productImages),
  specs: many(productSpecs),
  offers: many(offers),
  daily: many(productDaily),
  stats: one(productStats, { fields: [products.id], references: [productStats.productId] }),
}));

export const productGtinsRelations = relations(productGtins, ({ one }) => ({
  product: one(products, { fields: [productGtins.productId], references: [products.id] }),
}));

export const productImagesRelations = relations(productImages, ({ one }) => ({
  product: one(products, { fields: [productImages.productId], references: [products.id] }),
}));

export const productSpecsRelations = relations(productSpecs, ({ one }) => ({
  product: one(products, { fields: [productSpecs.productId], references: [products.id] }),
}));

export const offersRelations = relations(offers, ({ one, many }) => ({
  shop: one(shops, { fields: [offers.shopId], references: [shops.id] }),
  source: one(shopSources, { fields: [offers.sourceId], references: [shopSources.id] }),
  product: one(products, { fields: [offers.productId], references: [products.id] }),
  events: many(priceEvents),
  candidates: many(matchCandidates),
  decisions: many(matchDecisions),
}));

export const priceEventsRelations = relations(priceEvents, ({ one }) => ({
  offer: one(offers, { fields: [priceEvents.offerId], references: [offers.id] }),
}));

export const productDailyRelations = relations(productDaily, ({ one }) => ({
  product: one(products, { fields: [productDaily.productId], references: [products.id] }),
}));

export const productStatsRelations = relations(productStats, ({ one }) => ({
  product: one(products, { fields: [productStats.productId], references: [products.id] }),
}));

export const matchCandidatesRelations = relations(matchCandidates, ({ one }) => ({
  offer: one(offers, { fields: [matchCandidates.offerId], references: [offers.id] }),
  product: one(products, { fields: [matchCandidates.productId], references: [products.id] }),
}));

export const matchDecisionsRelations = relations(matchDecisions, ({ one }) => ({
  offer: one(offers, { fields: [matchDecisions.offerId], references: [offers.id] }),
  product: one(products, { fields: [matchDecisions.productId], references: [products.id] }),
}));
