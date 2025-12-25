"""Services package."""

from researchhub.services.azure_ad import AzureADService
from researchhub.services.custom_field import CustomFieldService
from researchhub.services.task_assignment import TaskAssignmentService
from researchhub.services.task_document import TaskDocumentService
from researchhub.services.recurring_task import RecurringTaskService
from researchhub.services.review import ReviewService
from researchhub.services.workflow import WorkflowService
from researchhub.services.notification import NotificationService
from researchhub.services.pdf_generator import PDFGenerator, pdf_generator
from researchhub.services.external_apis import (
    CrossRefService,
    PubMedService,
    PaperMetadata,
    crossref_service,
    pubmed_service,
)

__all__ = [
    "AzureADService",
    "CustomFieldService",
    "TaskAssignmentService",
    "TaskDocumentService",
    "RecurringTaskService",
    "ReviewService",
    "WorkflowService",
    "NotificationService",
    "PDFGenerator",
    "pdf_generator",
    "CrossRefService",
    "PubMedService",
    "PaperMetadata",
    "crossref_service",
    "pubmed_service",
]
