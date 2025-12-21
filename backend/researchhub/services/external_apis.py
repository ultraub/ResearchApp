"""External API integrations for CrossRef and PubMed."""

from dataclasses import dataclass
from typing import Any

import httpx
import structlog
from Bio import Entrez

logger = structlog.get_logger()

# Configure Entrez for PubMed
Entrez.email = "researchhub@example.com"  # Required by NCBI


@dataclass
class PaperMetadata:
    """Standardized paper metadata from external sources."""

    title: str
    authors: list[str]
    abstract: str | None = None
    journal: str | None = None
    year: int | None = None
    volume: str | None = None
    issue: str | None = None
    pages: str | None = None
    doi: str | None = None
    pmid: str | None = None
    pmcid: str | None = None
    issn: str | None = None
    url: str | None = None
    keywords: list[str] | None = None


class CrossRefService:
    """Service for fetching paper metadata from CrossRef API."""

    BASE_URL = "https://api.crossref.org/works"

    def __init__(self, timeout: float = 30.0):
        self.timeout = timeout
        self.headers = {
            "User-Agent": "Pasteur/1.0 (mailto:researchhub@example.com)",
        }

    async def fetch_by_doi(self, doi: str) -> PaperMetadata | None:
        """Fetch paper metadata from CrossRef by DOI.

        Args:
            doi: The DOI to look up (e.g., "10.1038/nature12373")

        Returns:
            PaperMetadata if found, None otherwise
        """
        # Clean DOI
        doi = doi.strip()
        if doi.startswith("https://doi.org/"):
            doi = doi[16:]
        elif doi.startswith("http://dx.doi.org/"):
            doi = doi[18:]

        url = f"{self.BASE_URL}/{doi}"

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(url, headers=self.headers)

                if response.status_code == 404:
                    logger.warning("DOI not found in CrossRef", doi=doi)
                    return None

                response.raise_for_status()
                data = response.json()

            return self._parse_crossref_response(data)

        except httpx.TimeoutException:
            logger.error("CrossRef API timeout", doi=doi)
            return None
        except httpx.HTTPStatusError as e:
            logger.error("CrossRef API error", doi=doi, status=e.response.status_code)
            return None
        except Exception as e:
            logger.error("CrossRef API unexpected error", doi=doi, error=str(e))
            return None

    def _parse_crossref_response(self, data: dict[str, Any]) -> PaperMetadata:
        """Parse CrossRef API response into PaperMetadata."""
        message = data.get("message", {})

        # Extract authors
        authors = []
        for author in message.get("author", []):
            given = author.get("given", "")
            family = author.get("family", "")
            if given and family:
                authors.append(f"{given} {family}")
            elif family:
                authors.append(family)

        # Extract title
        title_list = message.get("title", [])
        title = title_list[0] if title_list else "Untitled"

        # Extract publication date
        year = None
        date_parts = message.get("published-print", {}).get("date-parts")
        if not date_parts:
            date_parts = message.get("published-online", {}).get("date-parts")
        if not date_parts:
            date_parts = message.get("created", {}).get("date-parts")
        if date_parts and date_parts[0]:
            year = date_parts[0][0]

        # Extract journal info
        journal = None
        container = message.get("container-title", [])
        if container:
            journal = container[0]

        # Extract abstract
        abstract = message.get("abstract")
        if abstract:
            # Clean HTML tags from abstract
            import re
            abstract = re.sub(r'<[^>]+>', '', abstract)

        # Extract keywords/subjects
        keywords = message.get("subject", [])

        return PaperMetadata(
            title=title,
            authors=authors,
            abstract=abstract,
            journal=journal,
            year=year,
            volume=message.get("volume"),
            issue=message.get("issue"),
            pages=message.get("page"),
            doi=message.get("DOI"),
            issn=message.get("ISSN", [None])[0] if message.get("ISSN") else None,
            url=message.get("URL"),
            keywords=keywords if keywords else None,
        )

    async def search(
        self,
        query: str,
        rows: int = 10,
        filter_type: str | None = None,
    ) -> list[PaperMetadata]:
        """Search CrossRef for papers.

        Args:
            query: Search query
            rows: Number of results to return (max 100)
            filter_type: Optional filter (e.g., "type:journal-article")

        Returns:
            List of PaperMetadata
        """
        params = {
            "query": query,
            "rows": min(rows, 100),
        }
        if filter_type:
            params["filter"] = filter_type

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(
                    self.BASE_URL,
                    params=params,
                    headers=self.headers
                )
                response.raise_for_status()
                data = response.json()

            results = []
            for item in data.get("message", {}).get("items", []):
                # Wrap item in expected format
                results.append(self._parse_crossref_response({"message": item}))

            return results

        except Exception as e:
            logger.error("CrossRef search error", query=query, error=str(e))
            return []


class PubMedService:
    """Service for fetching paper metadata from PubMed/NCBI."""

    def __init__(self, timeout: float = 30.0):
        self.timeout = timeout

    async def fetch_by_pmid(self, pmid: str) -> PaperMetadata | None:
        """Fetch paper metadata from PubMed by PMID.

        Args:
            pmid: The PubMed ID to look up (e.g., "12345678")

        Returns:
            PaperMetadata if found, None otherwise
        """
        # Clean PMID
        pmid = pmid.strip()
        if pmid.lower().startswith("pmid:"):
            pmid = pmid[5:]

        try:
            # Use Biopython's Entrez to fetch data
            handle = Entrez.efetch(
                db="pubmed",
                id=pmid,
                rettype="xml",
                retmode="xml"
            )
            from Bio import Medline
            from xml.etree import ElementTree as ET

            xml_data = handle.read()
            handle.close()

            return self._parse_pubmed_xml(xml_data, pmid)

        except Exception as e:
            logger.error("PubMed API error", pmid=pmid, error=str(e))
            return None

    def _parse_pubmed_xml(self, xml_data: bytes, pmid: str) -> PaperMetadata | None:
        """Parse PubMed XML response into PaperMetadata."""
        from xml.etree import ElementTree as ET

        try:
            root = ET.fromstring(xml_data)
            article = root.find(".//PubmedArticle/MedlineCitation/Article")

            if article is None:
                logger.warning("No article found in PubMed response", pmid=pmid)
                return None

            # Extract title
            title_elem = article.find("ArticleTitle")
            title = title_elem.text if title_elem is not None else "Untitled"

            # Extract authors
            authors = []
            author_list = article.find("AuthorList")
            if author_list is not None:
                for author in author_list.findall("Author"):
                    last_name = author.find("LastName")
                    fore_name = author.find("ForeName")
                    if last_name is not None:
                        name = last_name.text
                        if fore_name is not None:
                            name = f"{fore_name.text} {name}"
                        authors.append(name)

            # Extract abstract
            abstract = None
            abstract_elem = article.find("Abstract/AbstractText")
            if abstract_elem is not None:
                abstract = abstract_elem.text

            # Extract journal info
            journal_elem = article.find("Journal")
            journal = None
            volume = None
            issue = None
            year = None

            if journal_elem is not None:
                title_elem = journal_elem.find("Title")
                if title_elem is not None:
                    journal = title_elem.text

                ji = journal_elem.find("JournalIssue")
                if ji is not None:
                    vol_elem = ji.find("Volume")
                    if vol_elem is not None:
                        volume = vol_elem.text

                    issue_elem = ji.find("Issue")
                    if issue_elem is not None:
                        issue = issue_elem.text

                    # Year from PubDate
                    pub_date = ji.find("PubDate")
                    if pub_date is not None:
                        year_elem = pub_date.find("Year")
                        if year_elem is not None:
                            year = int(year_elem.text)

            # Extract pagination
            pagination = article.find("Pagination/MedlinePgn")
            pages = pagination.text if pagination is not None else None

            # Extract DOI
            doi = None
            article_ids = root.find(".//PubmedArticle/PubmedData/ArticleIdList")
            if article_ids is not None:
                for aid in article_ids.findall("ArticleId"):
                    if aid.get("IdType") == "doi":
                        doi = aid.text
                        break

            # Extract PMCID
            pmcid = None
            if article_ids is not None:
                for aid in article_ids.findall("ArticleId"):
                    if aid.get("IdType") == "pmc":
                        pmcid = aid.text
                        break

            # Extract keywords/MeSH terms
            keywords = []
            mesh_list = root.find(".//PubmedArticle/MedlineCitation/MeshHeadingList")
            if mesh_list is not None:
                for mesh in mesh_list.findall("MeshHeading/DescriptorName"):
                    if mesh.text:
                        keywords.append(mesh.text)

            return PaperMetadata(
                title=title,
                authors=authors,
                abstract=abstract,
                journal=journal,
                year=year,
                volume=volume,
                issue=issue,
                pages=pages,
                doi=doi,
                pmid=pmid,
                pmcid=pmcid,
                keywords=keywords if keywords else None,
            )

        except ET.ParseError as e:
            logger.error("Failed to parse PubMed XML", pmid=pmid, error=str(e))
            return None

    async def search(
        self,
        query: str,
        max_results: int = 10,
    ) -> list[PaperMetadata]:
        """Search PubMed for papers.

        Args:
            query: Search query
            max_results: Maximum number of results

        Returns:
            List of PaperMetadata
        """
        try:
            # First, search for IDs
            search_handle = Entrez.esearch(
                db="pubmed",
                term=query,
                retmax=max_results
            )
            search_results = Entrez.read(search_handle)
            search_handle.close()

            id_list = search_results.get("IdList", [])
            if not id_list:
                return []

            # Then fetch details for each ID
            results = []
            for pmid in id_list:
                metadata = await self.fetch_by_pmid(pmid)
                if metadata:
                    results.append(metadata)

            return results

        except Exception as e:
            logger.error("PubMed search error", query=query, error=str(e))
            return []


# Singleton instances
crossref_service = CrossRefService()
pubmed_service = PubMedService()
