from datetime import datetime, timedelta, timezone

from langchain_core.tools import tool
from sqlalchemy import func
from sqlalchemy.orm import Session

from src.common.models import (
    Categorie, Evenement, OffreNormalisee,
    Scrapper, SiteSource, Snapshot, TenantCategorie,
)


def make_tools(
    db: Session,
    tenant_id: int,
    own_site_id: int | None,
    own_brand: str | None,
    profil_client: str,
):
    def _tenant_offer_ids_sq():
        return (
            db.query(OffreNormalisee.id)
            .join(Categorie, Categorie.id == OffreNormalisee.categorie_id)
            .join(TenantCategorie, TenantCategorie.categorie_id == Categorie.id)
            .filter(
                TenantCategorie.tenant_id == tenant_id,
                OffreNormalisee.categorie_id.isnot(None),
            )
            .subquery()
        )

    @tool
    def get_market_overview() -> dict:
        """Get KPIs for the current tenant: total offers, active sites, events last 7 days,
        active promotions, and stock ruptures."""
        offer_ids_sq = _tenant_offer_ids_sq()
        now = datetime.now(timezone.utc)
        seven_days_ago = now - timedelta(days=7)

        offres_total = (
            db.query(func.count(OffreNormalisee.id))
            .filter(OffreNormalisee.id.in_(offer_ids_sq))
            .scalar() or 0
        )

        sites_actifs = (
            db.query(func.count(func.distinct(SiteSource.id)))
            .join(Scrapper, Scrapper.site_source_id == SiteSource.id)
            .join(OffreNormalisee, OffreNormalisee.scraper_id == Scrapper.id)
            .filter(OffreNormalisee.id.in_(offer_ids_sq))
            .scalar() or 0
        )

        events_7j = (
            db.query(func.count(Evenement.id))
            .join(OffreNormalisee, OffreNormalisee.id == Evenement.offre_id)
            .filter(
                OffreNormalisee.id.in_(offer_ids_sq),
                Evenement.date_detection >= seven_days_ago,
            )
            .scalar() or 0
        )

        promos_actives = (
            db.query(func.count(OffreNormalisee.id))
            .filter(
                OffreNormalisee.id.in_(offer_ids_sq),
                OffreNormalisee.est_en_promotion == True,
            )
            .scalar() or 0
        )

        ruptures = (
            db.query(func.count(OffreNormalisee.id))
            .filter(
                OffreNormalisee.id.in_(offer_ids_sq),
                OffreNormalisee.statut_stock == "RUPTURE",
            )
            .scalar() or 0
        )

        return {
            "offres_total":    offres_total,
            "sites_actifs":    sites_actifs,
            "evenements_7j":   events_7j,
            "promos_actives":  promos_actives,
            "ruptures_stock":  ruptures,
        }

    @tool
    def get_recent_events(type_evenement: str = None, limit: int = 10) -> list:
        """Get recent competitive events for this tenant.
        type_evenement can be: BAISSE_PRIX, HAUSSE_PRIX, DEBUT_PROMOTION,
        RUPTURE_STOCK, RETOUR_STOCK, NOUVELLE_OFFRE_DECOUVERTE.
        Returns a list of recent events with product name, site, and price change."""
        offer_ids_sq = _tenant_offer_ids_sq()
        q = (
            db.query(Evenement, OffreNormalisee, SiteSource)
            .join(OffreNormalisee, OffreNormalisee.id == Evenement.offre_id)
            .join(Scrapper, OffreNormalisee.scraper_id == Scrapper.id)
            .join(SiteSource, SiteSource.id == Scrapper.site_source_id)
            .filter(OffreNormalisee.id.in_(offer_ids_sq))
        )
        if type_evenement:
            q = q.filter(Evenement.type_evenement == type_evenement)

        rows = q.order_by(Evenement.date_detection.desc()).limit(limit).all()

        result = []
        for e, o, s in rows:
            avant = float(e.valeur_avant) if e.valeur_avant is not None else None
            apres = float(e.valeur_apres) if e.valeur_apres is not None else None
            delta_pct = None
            if avant and apres and avant != 0:
                delta_pct = round((apres - avant) / avant * 100, 1)
            result.append({
                "type":          e.type_evenement,
                "date":          e.date_detection.isoformat() if e.date_detection else None,
                "produit":       o.nom,
                "site":          s.name,
                "prix_avant":    avant,
                "prix_apres":    apres,
                "variation_pct": delta_pct,
            })
        return result

    @tool
    def get_positioning_summary() -> dict:
        """Get price positioning summary vs competitors.
        Returns: pct_moins_cher, pct_dans_moyenne, pct_plus_cher and top 5 overpriced products."""
        if not own_site_id and not own_brand:
            return {"error": "Positionnement non disponible pour ce tenant"}

        snap_sq = (
            db.query(Snapshot.offre_id, Snapshot.prix_original)
            .filter(Snapshot.date_fin_observation.is_(None))
            .subquery()
        )

        scope_sq = (
            db.query(OffreNormalisee.produit_id)
            .join(Categorie, Categorie.id == OffreNormalisee.categorie_id)
            .join(TenantCategorie, TenantCategorie.categorie_id == Categorie.id)
            .filter(
                TenantCategorie.tenant_id == tenant_id,
                OffreNormalisee.produit_id.isnot(None),
            )
            .distinct()
            .subquery()
        )

        from sqlalchemy import case as sa_case

        if profil_client == "SITE_ECOMMERCE" and own_site_id:
            rows = (
                db.query(
                    OffreNormalisee.produit_id,
                    func.min(OffreNormalisee.nom).label("nom"),
                    func.min(sa_case(
                        (Scrapper.site_source_id == own_site_id, snap_sq.c.prix_original),
                        else_=None,
                    )).label("own_price"),
                    func.avg(sa_case(
                        (Scrapper.site_source_id != own_site_id, snap_sq.c.prix_original),
                        else_=None,
                    )).label("market_avg"),
                )
                .join(snap_sq, snap_sq.c.offre_id == OffreNormalisee.id)
                .join(Scrapper, Scrapper.id == OffreNormalisee.scraper_id)
                .join(Categorie, Categorie.id == OffreNormalisee.categorie_id)
                .filter(OffreNormalisee.produit_id.in_(scope_sq))
                .group_by(OffreNormalisee.produit_id)
                .all()
            )
        elif profil_client == "MARQUE" and own_brand:
            rows = (
                db.query(
                    OffreNormalisee.produit_id,
                    func.min(OffreNormalisee.nom).label("nom"),
                    func.min(sa_case(
                        (func.lower(OffreNormalisee.marque) == own_brand.lower(), snap_sq.c.prix_original),
                        else_=None,
                    )).label("own_price"),
                    func.avg(sa_case(
                        (func.lower(OffreNormalisee.marque) != own_brand.lower(), snap_sq.c.prix_original),
                        else_=None,
                    )).label("market_avg"),
                )
                .join(snap_sq, snap_sq.c.offre_id == OffreNormalisee.id)
                .join(Scrapper, Scrapper.id == OffreNormalisee.scraper_id)
                .join(Categorie, Categorie.id == OffreNormalisee.categorie_id)
                .filter(
                    OffreNormalisee.produit_id.in_(scope_sq),
                    OffreNormalisee.marque.isnot(None),
                )
                .group_by(OffreNormalisee.produit_id)
                .all()
            )
        else:
            return {"error": "Configuration manquante"}

        moins_cher = dans_moyenne = plus_cher = 0
        top_overpriced = []

        for r in rows:
            if r.own_price is None or r.market_avg is None:
                continue
            own_p = float(r.own_price)
            avg_p = float(r.market_avg)
            diff_pct = round((own_p - avg_p) / avg_p * 100, 1) if avg_p else 0

            if own_p <= avg_p * 0.95:
                moins_cher += 1
            elif own_p >= avg_p * 1.05:
                plus_cher += 1
                top_overpriced.append({
                    "produit":  r.nom,
                    "own_prix": round(own_p, 2),
                    "avg_prix": round(avg_p, 2),
                    "diff_pct": diff_pct,
                })
            else:
                dans_moyenne += 1

        total = moins_cher + dans_moyenne + plus_cher
        pct = lambda n: round(n / total * 100, 1) if total else 0.0

        top_overpriced.sort(key=lambda x: x["diff_pct"], reverse=True)

        return {
            "total_produits":    total,
            "pct_moins_cher":    pct(moins_cher),
            "pct_dans_moyenne":  pct(dans_moyenne),
            "pct_plus_cher":     pct(plus_cher),
            "top_surpasses":     top_overpriced[:5],
        }

    @tool
    def search_products(query: str, limit: int = 5) -> list:
        """Search products by name or brand in the tenant's scope.
        Returns: product name, brand, price range, number of sites selling it."""
        offer_ids_sq = _tenant_offer_ids_sq()
        snap_sq = (
            db.query(Snapshot.offre_id, Snapshot.prix_original)
            .filter(Snapshot.date_fin_observation.is_(None))
            .subquery()
        )

        rows = (
            db.query(
                OffreNormalisee.produit_id,
                func.min(OffreNormalisee.nom).label("nom"),
                func.min(OffreNormalisee.marque).label("marque"),
                func.min(snap_sq.c.prix_original).label("prix_min"),
                func.max(snap_sq.c.prix_original).label("prix_max"),
                func.count(func.distinct(Scrapper.site_source_id)).label("nb_sites"),
            )
            .join(snap_sq, snap_sq.c.offre_id == OffreNormalisee.id)
            .join(Scrapper, Scrapper.id == OffreNormalisee.scraper_id)
            .filter(
                OffreNormalisee.id.in_(offer_ids_sq),
                OffreNormalisee.produit_id.isnot(None),
                OffreNormalisee.nom.ilike(f"%{query}%"),
            )
            .group_by(OffreNormalisee.produit_id)
            .limit(limit)
            .all()
        )

        return [
            {
                "produit_id": r.produit_id,
                "nom":        r.nom,
                "marque":     r.marque,
                "prix_min":   round(float(r.prix_min), 2) if r.prix_min else None,
                "prix_max":   round(float(r.prix_max), 2) if r.prix_max else None,
                "nb_sites":   r.nb_sites,
            }
            for r in rows
        ]

    @tool
    def get_competitor_activity(site_slug: str = None) -> dict:
        """Get competitor price changes and active promotions.
        If site_slug is provided (e.g. 'mytek', 'spacenet'), filter to that site only.
        Returns: top competitors ranked by aggressiveness (price cuts + promotions)."""
        offer_ids_sq = _tenant_offer_ids_sq()
        now = datetime.now(timezone.utc)
        seven_days_ago = now - timedelta(days=7)

        # Build site filter once
        site_filter = []
        if own_site_id:
            site_filter.append(SiteSource.id != own_site_id)
        if site_slug:
            site_filter.append(SiteSource.scraper_id == site_slug)

        # Query 1: price drops per site (aggregated)
        baisses_rows = (
            db.query(
                SiteSource.id.label("site_id"),
                SiteSource.name.label("site_name"),
                SiteSource.scraper_id.label("site_slug"),
                func.count(Evenement.id).label("nb_baisses"),
            )
            .join(Scrapper, Scrapper.site_source_id == SiteSource.id)
            .join(OffreNormalisee, OffreNormalisee.scraper_id == Scrapper.id)
            .join(Evenement, Evenement.offre_id == OffreNormalisee.id)
            .filter(
                OffreNormalisee.id.in_(offer_ids_sq),
                Evenement.type_evenement == "BAISSE_PRIX",
                Evenement.date_detection >= seven_days_ago,
                *site_filter,
            )
            .group_by(SiteSource.id, SiteSource.name, SiteSource.scraper_id)
            .all()
        )

        # Query 2: active promos per site (aggregated)
        promos_rows = (
            db.query(
                SiteSource.id.label("site_id"),
                func.count(OffreNormalisee.id).label("nb_promos"),
            )
            .join(Scrapper, Scrapper.site_source_id == SiteSource.id)
            .join(OffreNormalisee, OffreNormalisee.scraper_id == Scrapper.id)
            .filter(
                OffreNormalisee.id.in_(offer_ids_sq),
                OffreNormalisee.est_en_promotion == True,
                *site_filter,
            )
            .group_by(SiteSource.id)
            .all()
        )

        promos_by_site = {r.site_id: r.nb_promos for r in promos_rows}

        result = []
        seen_site_ids = set()
        for r in baisses_rows:
            seen_site_ids.add(r.site_id)
            promos = promos_by_site.get(r.site_id, 0)
            result.append({
                "site":            r.site_name,
                "site_slug":       r.site_slug,
                "baisses_prix_7j": r.nb_baisses,
                "promos_actives":  promos,
                "agressivite":     r.nb_baisses + promos,
            })

        # Include sites with promos but no baisses
        for r in promos_rows:
            if r.site_id not in seen_site_ids:
                site = db.get(SiteSource, r.site_id)
                if site:
                    result.append({
                        "site":            site.name,
                        "site_slug":       site.scraper_id,
                        "baisses_prix_7j": 0,
                        "promos_actives":  r.nb_promos,
                        "agressivite":     r.nb_promos,
                    })

        result.sort(key=lambda x: x["agressivite"], reverse=True)
        return {"concurrents": result}

    @tool
    def get_stock_ruptures() -> list:
        """Get products where competitors are out of stock (rupture).
        Returns products where competitors are in rupture — potential opportunity."""
        offer_ids_sq = _tenant_offer_ids_sq()

        q = (
            db.query(OffreNormalisee, SiteSource)
            .join(Scrapper, OffreNormalisee.scraper_id == Scrapper.id)
            .join(SiteSource, SiteSource.id == Scrapper.site_source_id)
            .filter(
                OffreNormalisee.id.in_(offer_ids_sq),
                OffreNormalisee.statut_stock == "RUPTURE",
            )
        )
        if own_site_id:
            q = q.filter(Scrapper.site_source_id != own_site_id)

        rows = q.order_by(OffreNormalisee.nom).limit(20).all()

        return [
            {
                "produit": o.nom,
                "marque":  o.marque,
                "site":    s.name,
            }
            for o, s in rows
        ]

    @tool
    def search_documents(query: str, limit: int = 4) -> str:
        """Search the tenant's uploaded documents (PDF, DOCX, TXT) for information
        relevant to the query. Use this tool whenever the user asks about a document
        they uploaded, or when market/pricing context from internal documents is needed.
        Returns the most relevant text excerpts."""
        from src.ai.embeddings import embed_text
        from src.common.models import DocumentChunk, TenantDocument

        # Check if any documents exist for this tenant
        doc_count = (
            db.query(func.count(TenantDocument.id))
            .filter(TenantDocument.tenant_id == tenant_id)
            .scalar() or 0
        )
        if doc_count == 0:
            return "Aucun document n'a été uploadé pour ce tenant."

        query_embedding = embed_text(query)

        chunks = (
            db.query(DocumentChunk)
            .filter(DocumentChunk.tenant_id == tenant_id)
            .order_by(DocumentChunk.embedding.cosine_distance(query_embedding))
            .limit(limit)
            .all()
        )

        if not chunks:
            return "Aucun extrait pertinent trouvé dans les documents uploadés."

        parts = []
        for i, chunk in enumerate(chunks, 1):
            source = (chunk.chunk_meta or {}).get("source", "document")
            parts.append(f"[Extrait {i} – {source}]\n{chunk.content}")

        return "\n\n".join(parts)

    return [
        get_market_overview,
        get_recent_events,
        get_positioning_summary,
        search_products,
        get_competitor_activity,
        get_stock_ruptures,
        search_documents,
    ]
