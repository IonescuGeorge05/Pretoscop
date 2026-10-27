# @pretoscop/fetch

The only HTTP client the crawler ever uses: identified (`PretoscopBot/1.0`), throttled per domain,
robots.txt-compliant (RFC 9309), with block detection, pauses and request logging.

Contract: filled by M02 (`fetchPolite`, `isAllowedByRobots`, `pauseDomain`) and M05B (assisted channel).
