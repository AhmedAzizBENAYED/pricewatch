import logging
from datetime import datetime, timezone

from src.common.models.alerte import Alerte
from src.common.models.notification import Notification
from src.common.models.evenement import Evenement
from src.common.models.offre import OffreNormalisee
from src.common.models.tenant_categorie import TenantCategorie
from src.common.models.utilisateur import Utilisateur

logger = logging.getLogger(__name__)


def process_alerts_for_event(db, event: Evenement):
    offre = db.query(OffreNormalisee).filter(OffreNormalisee.id == event.offre_id).first()
    if not offre or not offre.categorie_id:
        return

    tenant_ids = (
        db.query(TenantCategorie.tenant_id)
        .filter(TenantCategorie.categorie_id == offre.categorie_id)
        .all()
    )
    tenant_ids = [t.tenant_id for t in tenant_ids]

    for tenant_id in tenant_ids:
        matching_rules = (
            db.query(Alerte)
            .filter(
                Alerte.tenant_id == tenant_id,
                Alerte.alert == True,
                Alerte.type_evenement == event.type_evenement,
            )
            .all()
        )

        for rule in matching_rules:
            if rule.seuil and event.valeur_avant:
                pct = abs(
                    (float(event.valeur_apres or 0) - float(event.valeur_avant))
                    / float(event.valeur_avant) * 100
                )
                if pct < rule.seuil:
                    continue

            if rule.liste_categories:
                if offre.categorie_id not in rule.liste_categories:
                    continue

            users = (
                db.query(Utilisateur)
                .filter(
                    Utilisateur.tenant_id == tenant_id,
                    Utilisateur.est_actif == True,
                )
                .all()
            )

            for user in users:
                notif = Notification(
                    id_utilisateur=user.id,
                    evenement_id=event.id,
                    lu=False,
                    date_creation=datetime.now(timezone.utc),
                )
                db.add(notif)

    db.flush()