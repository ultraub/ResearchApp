"""API router package."""

from fastapi import APIRouter

from researchhub.api.v1 import (
    activities,
    ai,
    analytics,
    auth,
    blockers,
    comment_reads,
    documents,
    exports,
    health,
    ideas,
    invites,
    journals,
    knowledge,
    organizations,
    projects,
    reviews,
    search,
    sharing,
    tasks,
    teams,
    users,
    websocket,
)

router = APIRouter()

# Include all API routers
router.include_router(health.router, tags=["Health"])
router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
router.include_router(users.router, prefix="/users", tags=["Users"])
router.include_router(organizations.router, prefix="/organizations", tags=["Organizations"])
router.include_router(teams.router, prefix="/teams", tags=["Teams"])
router.include_router(invites.router, prefix="/invites", tags=["Invites"])
router.include_router(ideas.router, prefix="/ideas", tags=["Ideas"])
router.include_router(projects.router, prefix="/projects", tags=["Projects"])
router.include_router(tasks.router, prefix="/tasks", tags=["Tasks"])
router.include_router(blockers.router, prefix="/blockers", tags=["Blockers"])
router.include_router(documents.router, prefix="/documents", tags=["Documents"])
router.include_router(journals.router, prefix="/journals", tags=["Journals"])
router.include_router(knowledge.router, prefix="/knowledge", tags=["Knowledge"])
router.include_router(activities.router, prefix="/activities", tags=["Activities"])
router.include_router(sharing.router, prefix="/sharing", tags=["Sharing"])
router.include_router(search.router, prefix="/search", tags=["Search"])
router.include_router(analytics.router, prefix="/analytics", tags=["Analytics"])
router.include_router(exports.router, prefix="/exports", tags=["Exports"])
router.include_router(websocket.router, tags=["WebSocket"])
router.include_router(ai.router, prefix="/ai", tags=["AI"])
router.include_router(reviews.router, prefix="/reviews", tags=["Reviews"])
router.include_router(comment_reads.router, prefix="/comment-reads", tags=["Comment Reads"])
