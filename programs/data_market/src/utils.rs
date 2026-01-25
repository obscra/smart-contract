//!  SOL transfers, fee arithmetic, price interpolation.

use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::constants::BASIS_DENOMINATOR;
use crate::errors::ObscraError;

pub fn current_ts() -> Result<i64> {
    Ok(Clock::get()?.unix_timestamp)
}

pub fn compute_fee_split(
    price: u64,
    fee_bps: u16,
    royalty_bps: u16,
) -> Result<(u64, u64, u64)> {
    let fee = safe_basis_mul(price, fee_bps)?;
    let royalty = safe_basis_mul(price, royalty_bps)?;
    let seller_net = price
        .checked_sub(fee)
        .and_then(|v| v.checked_sub(royalty))
        .ok_or(ObscraError::ArithmeticOverflow)?;
    Ok((fee, royalty, seller_net))
}

fn safe_basis_mul(amount: u64, bps: u16) -> Result<u64> {
    Ok(amount
        .checked_mul(bps as u64)
        .ok_or(ObscraError::ArithmeticOverflow)?
        / BASIS_DENOMINATOR)
}

pub fn send_lamports<'info>(
    system_program: &Program<'info, System>,
    from: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    system_program::transfer(
        CpiContext::new(
            system_program.to_account_info(),
            system_program::Transfer {
                from: from.clone(),
                to: to.clone(),
            },
        ),
        amount,
    )
}

pub fn drain_pda<'info>(
    from: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    **from.try_borrow_mut_lamports()? = from
        .lamports()
        .checked_sub(amount)
        .ok_or(ObscraError::ArithmeticOverflow)?;
    **to.try_borrow_mut_lamports()? = to
        .lamports()
        .checked_add(amount)
        .ok_or(ObscraError::ArithmeticOverflow)?;
    Ok(())
}

pub fn interpolate_declining_price(
    now: i64,
    start_time: i64,
    end_time: i64,
    start_price: u64,
    floor_price: u64,
) -> Result<u64> {
    if now <= start_time {
        return Ok(start_price);
    }
    if now >= end_time {
        return Ok(floor_price);
    }
    let elapsed = (now - start_time) as u128;
    let total = (end_time - start_time) as u128;
    let drop = (start_price - floor_price) as u128;
    let delta = drop
        .checked_mul(elapsed)
        .ok_or(ObscraError::ArithmeticOverflow)?
        / total;
    Ok(start_price - delta as u64)
}
