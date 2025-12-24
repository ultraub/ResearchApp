"""Seed script to create a demo project for new users.

This creates a shared, read-only demo project that showcases the platform's features:
- Hierarchical project structure with subprojects
- Tasks across all statuses
- Blockers with varying impact levels
- Sample comments demonstrating collaboration

Usage:
    python -m researchhub.scripts.seed_demo_project

The demo project uses:
- scope: ORGANIZATION (visible to entire org)
- is_org_public: True (accessible to all org members)
- org_public_role: viewer (read-only access)
- is_demo: True (special demo flag for frontend filtering)
"""

import asyncio
import sys
from datetime import date, timedelta
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from researchhub.db.session import async_session_factory
from researchhub.models.organization import Organization, Team
from researchhub.models.project import Blocker, Project, Task, TaskComment
from researchhub.models.user import User


# Demo project content
DEMO_PROJECT = {
    "name": "Demo: Systematic Literature Review on ML in Healthcare",
    "description": """This is a demo project showcasing how to organize a complex research initiative.

**Research Objective:** Conduct a systematic review of machine learning applications in healthcare diagnostics, focusing on recent advances in medical imaging analysis.

**Scope:**
- Review papers from 2020-2024
- Focus on FDA-approved or clinical-stage ML systems
- Analyze implementation challenges and outcomes

Explore the subprojects, tasks, and blockers to see how the platform can help organize your research workflow.""",
    "color": "#8B5CF6",  # Purple
    "project_type": "literature_review",
    "tags": ["demo", "ml", "healthcare", "systematic-review"],
}

SUBPROJECTS = [
    {
        "name": "Literature Search & Screening",
        "description": """Phase 1: Systematic literature search across PubMed, IEEE Xplore, and ArXiv.

**Search Strategy:**
- Primary keywords: machine learning, deep learning, medical imaging
- Secondary filters: diagnostic accuracy, clinical validation
- Date range: 2020-2024""",
        "color": "#3B82F6",  # Blue
        "project_type": "literature_review",
        "tags": ["search", "screening"],
    },
    {
        "name": "Data Extraction & Analysis",
        "description": """Phase 2: Extract key data from included studies and perform meta-analysis.

**Extraction Template:**
- Study characteristics (design, population, ML model type)
- Performance metrics (sensitivity, specificity, AUC)
- Implementation details (training data, validation approach)""",
        "color": "#10B981",  # Green
        "project_type": "data_analysis",
        "tags": ["extraction", "analysis"],
    },
]

# Tasks for main project
MAIN_PROJECT_TASKS = [
    # Done tasks
    {
        "title": "Define research question and PICO criteria",
        "status": "done",
        "priority": "high",
        "description": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Established clear research question following PICO framework for systematic review."}]}]},
    },
    {
        "title": "Register protocol on PROSPERO",
        "status": "done",
        "priority": "high",
        "description": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Protocol registered to ensure transparency and prevent duplication."}]}]},
    },
    # In review
    {
        "title": "Draft methods section for manuscript",
        "status": "in_review",
        "priority": "medium",
        "description": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Complete methods section ready for co-author review."}]}]},
    },
]

# Tasks for subproject 1 (Literature Search)
SUBPROJECT1_TASKS = [
    # Done
    {
        "title": "Develop search strategy for PubMed",
        "status": "done",
        "priority": "high",
        "description": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Created comprehensive MeSH-based search strategy with Boolean operators."}]}]},
    },
    {
        "title": "Execute PubMed search",
        "status": "done",
        "priority": "medium",
        "description": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Retrieved 2,847 initial records from PubMed database."}]}]},
    },
    {
        "title": "Execute IEEE Xplore search",
        "status": "done",
        "priority": "medium",
        "description": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Retrieved 1,234 records from IEEE focusing on technical implementations."}]}]},
    },
    # In progress
    {
        "title": "Complete title/abstract screening",
        "status": "in_progress",
        "priority": "high",
        "description": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Screening 4,081 records after deduplication. Currently at 65% completion."}]}]},
    },
    {
        "title": "Resolve screening conflicts (12 papers)",
        "status": "in_progress",
        "priority": "medium",
        "description": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Third reviewer needed to resolve disagreements on 12 borderline papers."}]}]},
    },
    # To do
    {
        "title": "Full-text review of included studies",
        "status": "todo",
        "priority": "high",
        "description": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Retrieve and review full text for ~200 potentially eligible studies."}]}]},
    },
    {
        "title": "Create PRISMA flow diagram",
        "status": "todo",
        "priority": "low",
        "description": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Document the screening process with standard PRISMA flowchart."}]}]},
    },
]

# Tasks for subproject 2 (Data Extraction)
SUBPROJECT2_TASKS = [
    # Done
    {
        "title": "Design data extraction form",
        "status": "done",
        "priority": "high",
        "description": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Created standardized extraction template covering all key variables."}]}]},
    },
    {
        "title": "Pilot extraction on 5 studies",
        "status": "done",
        "priority": "medium",
        "description": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Tested extraction form and refined based on pilot results."}]}]},
    },
    # In progress
    {
        "title": "Extract data from remaining studies",
        "status": "in_progress",
        "priority": "high",
        "description": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Systematic data extraction in progress. 45 of 180 studies completed."}]}]},
    },
    # To do
    {
        "title": "Quality assessment (QUADAS-2)",
        "status": "todo",
        "priority": "high",
        "description": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Assess risk of bias using QUADAS-2 tool for diagnostic accuracy studies."}]}]},
    },
    {
        "title": "Perform meta-analysis",
        "status": "todo",
        "priority": "high",
        "description": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Statistical pooling of diagnostic accuracy metrics using random-effects model."}]}]},
    },
    {
        "title": "Create forest plots and summary tables",
        "status": "todo",
        "priority": "medium",
        "description": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Visualize results with forest plots for each outcome measure."}]}]},
    },
]

# Blockers
BLOCKERS = [
    {
        "title": "Waiting for full-text access from library",
        "description": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Requested interlibrary loan for 8 papers not available through our institution. Expected 5-7 business days."}]}]},
        "status": "open",
        "priority": "medium",
        "impact_level": "medium",
        "blocker_type": "external_dependency",
        "tags": ["library", "access"],
    },
    {
        "title": "Statistical software license expired",
        "description": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "R packages for meta-analysis require updated institutional license. IT ticket submitted."}]}]},
        "status": "open",
        "priority": "high",
        "impact_level": "high",
        "blocker_type": "resource",
        "tags": ["software", "license"],
    },
]

# Sample comments for tasks (plain text, not JSONB)
SAMPLE_COMMENTS = [
    {
        "task_title": "Complete title/abstract screening",
        "content": "Made good progress today - completed 200 abstracts. The ML classification criteria are working well for identifying relevant imaging studies.",
    },
    {
        "task_title": "Draft methods section for manuscript",
        "content": "I've added the search strategy details and included the Boolean operators. Can you review the inclusion/exclusion criteria wording?",
    },
]


async def get_or_create_demo_org_and_team(db: AsyncSession) -> tuple[Organization, Team, User | None]:
    """Get existing organization and team, or create demo ones."""
    # Try to find any existing organization
    result = await db.execute(select(Organization).limit(1))
    org = result.scalar_one_or_none()

    if org is None:
        print("No organization found. Creating a demo organization...")
        org = Organization(
            id=uuid4(),
            name="Demo Organization",
            slug="demo-org",
        )
        db.add(org)
        await db.flush()

    # Try to find a personal team in this organization (demo appears in "Personal" section)
    result = await db.execute(
        select(Team).where(Team.organization_id == org.id, Team.is_personal == True).limit(1)
    )
    team = result.scalar_one_or_none()

    # Fallback to any team if no personal team found
    if team is None:
        result = await db.execute(
            select(Team).where(Team.organization_id == org.id).limit(1)
        )
        team = result.scalar_one_or_none()

    if team is None:
        print("No team found. Creating a demo team...")
        team = Team(
            id=uuid4(),
            name="Research Team",
            organization_id=org.id,
            is_personal=False,
        )
        db.add(team)
        await db.flush()

    # Try to find a user to be the creator
    result = await db.execute(select(User).limit(1))
    user = result.scalar_one_or_none()

    return org, team, user


async def check_existing_demo(db: AsyncSession) -> bool:
    """Check if a demo project already exists."""
    result = await db.execute(
        select(Project).where(Project.is_demo == True)
    )
    existing = result.scalar_one_or_none()
    return existing is not None


async def seed_demo_project(db: AsyncSession) -> None:
    """Create the demo project with all content."""
    # Check if demo already exists
    if await check_existing_demo(db):
        print("Demo project already exists. Skipping seed.")
        return

    # Get or create org/team/user
    org, team, user = await get_or_create_demo_org_and_team(db)
    user_id = user.id if user else None

    print(f"Using organization: {org.name}")
    print(f"Using team: {team.name}")
    if user:
        print(f"Creator: {user.email}")

    # Create main demo project
    main_project = Project(
        id=uuid4(),
        name=DEMO_PROJECT["name"],
        description=DEMO_PROJECT["description"],
        color=DEMO_PROJECT["color"],
        project_type=DEMO_PROJECT["project_type"],
        tags=DEMO_PROJECT["tags"],
        status="active",
        scope="ORGANIZATION",
        is_org_public=True,
        org_public_role="viewer",
        is_demo=True,
        team_id=team.id,
        created_by_id=user_id,
        start_date=date.today() - timedelta(days=30),
        target_end_date=date.today() + timedelta(days=60),
    )
    db.add(main_project)
    await db.flush()
    print(f"Created main project: {main_project.name}")

    # Create subprojects
    subproject_ids = []
    for sp_data in SUBPROJECTS:
        subproject = Project(
            id=uuid4(),
            name=sp_data["name"],
            description=sp_data["description"],
            color=sp_data["color"],
            project_type=sp_data["project_type"],
            tags=sp_data["tags"],
            status="active",
            scope="ORGANIZATION",
            is_org_public=True,
            org_public_role="viewer",
            is_demo=True,
            parent_id=main_project.id,
            team_id=team.id,
            created_by_id=user_id,
        )
        db.add(subproject)
        await db.flush()
        subproject_ids.append(subproject.id)
        print(f"  Created subproject: {subproject.name}")

    # Create tasks for main project
    task_map: dict[str, Task] = {}
    position = 0
    for task_data in MAIN_PROJECT_TASKS:
        task = Task(
            id=uuid4(),
            title=task_data["title"],
            description=task_data.get("description"),
            status=task_data["status"],
            priority=task_data["priority"],
            project_id=main_project.id,
            created_by_id=user_id,
            position=position,
        )
        db.add(task)
        task_map[task.title] = task
        position += 1
    print(f"  Created {len(MAIN_PROJECT_TASKS)} tasks in main project")

    # Create tasks for subproject 1
    position = 0
    for task_data in SUBPROJECT1_TASKS:
        task = Task(
            id=uuid4(),
            title=task_data["title"],
            description=task_data.get("description"),
            status=task_data["status"],
            priority=task_data["priority"],
            project_id=subproject_ids[0],
            created_by_id=user_id,
            position=position,
            due_date=date.today() + timedelta(days=14) if task_data["status"] == "in_progress" else None,
        )
        db.add(task)
        task_map[task.title] = task
        position += 1
    print(f"  Created {len(SUBPROJECT1_TASKS)} tasks in Literature Search subproject")

    # Create tasks for subproject 2
    position = 0
    for task_data in SUBPROJECT2_TASKS:
        task = Task(
            id=uuid4(),
            title=task_data["title"],
            description=task_data.get("description"),
            status=task_data["status"],
            priority=task_data["priority"],
            project_id=subproject_ids[1],
            created_by_id=user_id,
            position=position,
            due_date=date.today() + timedelta(days=21) if task_data["status"] == "todo" and task_data["priority"] == "high" else None,
        )
        db.add(task)
        task_map[task.title] = task
        position += 1
    print(f"  Created {len(SUBPROJECT2_TASKS)} tasks in Data Analysis subproject")

    await db.flush()

    # Create blockers
    for blocker_data in BLOCKERS:
        blocker = Blocker(
            id=uuid4(),
            title=blocker_data["title"],
            description=blocker_data.get("description"),
            status=blocker_data["status"],
            priority=blocker_data["priority"],
            impact_level=blocker_data["impact_level"],
            blocker_type=blocker_data["blocker_type"],
            tags=blocker_data.get("tags", []),
            project_id=main_project.id,
            created_by_id=user_id,
        )
        db.add(blocker)
    print(f"  Created {len(BLOCKERS)} blockers")

    # Create sample comments
    for comment_data in SAMPLE_COMMENTS:
        task = task_map.get(comment_data["task_title"])
        if task:
            comment = TaskComment(
                id=uuid4(),
                task_id=task.id,
                user_id=user_id,
                content=comment_data["content"],
            )
            db.add(comment)
    print(f"  Created {len(SAMPLE_COMMENTS)} sample comments")

    await db.commit()
    print("\nDemo project seeded successfully!")
    print(f"Project ID: {main_project.id}")


async def main() -> None:
    """Main entry point."""
    print("Seeding demo project...")
    print("-" * 50)

    async with async_session_factory() as db:
        try:
            await seed_demo_project(db)
        except Exception as e:
            print(f"Error seeding demo project: {e}")
            await db.rollback()
            raise


if __name__ == "__main__":
    asyncio.run(main())
