"""Deterministic Direct Mode checks for OmniMarket's storage-facing surface.

Payable native-GEN transfers and non-deterministic consensus are deliberately
covered by Studio/browser evidence. These tests focus on Direct Mode's
in-memory, deterministic contract execution path.
"""

from genlayer import u256


CONTRACT_PATH = "contracts/omnimarket.py"


def test_deployment_starts_without_markets(direct_deploy):
    contract = direct_deploy(CONTRACT_PATH)

    assert contract.get_market_count() == u256(0)


def test_unknown_market_reads_revert_cleanly(direct_deploy, direct_vm):
    contract = direct_deploy(CONTRACT_PATH)

    with direct_vm.expect_revert("unknown market"):
        contract.get_market(u256(1))


def test_market_indexing_rejects_zero_and_out_of_range_values(direct_deploy, direct_vm):
    contract = direct_deploy(CONTRACT_PATH)

    with direct_vm.expect_revert("market index out of range"):
        contract.get_market_id_at(u256(0))

    with direct_vm.expect_revert("market index out of range"):
        contract.get_market_id_at(u256(1))
