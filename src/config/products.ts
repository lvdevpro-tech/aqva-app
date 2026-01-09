export type ProductId = "aqva_pack_1_5l_x6";

export const PRODUCTS: Record<ProductId, {
  id: ProductId;
  name: string;
  subtitle: string;
  unitLabel: string;
  unitPrice: number; // ex: 79.99
  currency: "ZAR";
  image: string;     // URL publique (public/)
  imageAlt: string;
}> = {
  aqva_pack_1_5l_x6: {
    id: "aqva_pack_1_5l_x6",
    name: "AQVA Pack",
    subtitle: "6 × 1.5L Sealed Bottles",
    unitLabel: "pack",
    unitPrice: 79.99,
    currency: "ZAR",
    image: "/products/aquelle-1_5l-x6.png",
    imageAlt: "aQuelle Natural Spring Water 6 x 1.5L",
  },
};
