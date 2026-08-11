"""Direct Mode checks for the V3 storage-facing discovery surface.

V3 payable transfers and consensus require Bradbury evidence. These checks
cover only deterministic views that must be valid before deployment.
"""

from genlayer import u256


CONTRACT_PATH = "contracts/omnimarket_v3.py"


def test_v3_deployment_starts_without_markets_or_account_index(direct_deploy):
    contract = direct_deploy(CONTRACT_PATH)

    assert contract.get_market_count() == u256(0)
    assert contract.get_account_market_count("0x0000000000000000000000000000000000000001") == u256(0)


def test_v3_deployment_starts_with_zeroed_protocol_obligations(direct_deploy):
    contract = direct_deploy(CONTRACT_PATH)

    protocol = contract.get_protocol_state()
    assert protocol.accrued_fees == u256(0)
    assert protocol.withdrawn_fees == u256(0)
    assert protocol.claim_liability == u256(0)
    assert protocol.outstanding_challenge_bonds == u256(0)
    assert protocol.risk_paused is False
    assert protocol.paused_at == u256(0)


def test_v3_empty_index_reads_revert_cleanly(direct_deploy, direct_vm):
    contract = direct_deploy(CONTRACT_PATH)

    with direct_vm.expect_revert("market index out of range"):
        contract.get_market_id_at(u256(1))

    with direct_vm.expect_revert("account market index out of range"):
        contract.get_account_market_id_at("0x0000000000000000000000000000000000000001", u256(1))

    with direct_vm.expect_revert("no challenge"):
        contract.get_challenge(u256(1))
